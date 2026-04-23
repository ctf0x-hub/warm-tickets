// Handles SSLCommerz IPN (Instant Payment Notification) — server-to-server.
// Equivalent of the old stripe-webhook. Validates the payment then mints tickets.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const VALIDATE_SANDBOX = "https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php";
const VALIDATE_LIVE    = "https://securepay.sslcommerz.com/validator/api/validationserverAPI.php";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  // SSLCommerz POSTs form-encoded data
  const formData  = await req.formData();
  const status    = formData.get("status") as string;
  const tranId    = formData.get("tran_id") as string;
  const valId     = formData.get("val_id") as string;
  const amount    = formData.get("amount") as string;
  const currency  = formData.get("currency") as string;

  console.log("IPN received", { status, tranId, valId });

  if (status !== "VALID" && status !== "VALIDATED") {
    // Payment failed or cancelled — release the held seats
    if (tranId) {
      await admin.rpc("release_cart_by_session", { _session_id: tranId });
      console.log("Holds released for failed payment:", tranId);
    }
    return new Response("OK", { status: 200 });
  }

  // Validate with SSLCommerz server-to-server to prevent spoofing
  const storeId     = Deno.env.get("SSLCOMMERZ_STORE_ID")!;
  const storePasswd = Deno.env.get("SSLCOMMERZ_STORE_PASSWORD")!;
  const isLive      = Deno.env.get("SSLCOMMERZ_IS_LIVE") === "true";
  const validateUrl = isLive ? VALIDATE_LIVE : VALIDATE_SANDBOX;

  const validateRes = await fetch(
    `${validateUrl}?val_id=${valId}&store_id=${storeId}&store_passwd=${storePasswd}&format=json`
  );
  const validation = await validateRes.json();

  if (validation.status !== "VALID" && validation.status !== "VALIDATED") {
    console.error("SSLCommerz validation failed", validation);
    return new Response("Validation failed", { status: 400 });
  }

  // Check holds exist and aren't expired
  const { data: holds } = await admin
    .from("cart_reservations")
    .select("id, expires_at")
    .eq("payment_session_id", tranId);

  if (!holds || holds.length === 0) {
    console.log("No holds for tran_id (already processed):", tranId);
    return new Response("OK", { status: 200 }); // idempotent
  }

  const now        = Date.now();
  const allExpired = holds.every((h) => new Date(h.expires_at).getTime() <= now);

  if (allExpired) {
    // Paid but holds expired — we cannot issue tickets, must refund manually
    // (SSLCommerz has no programmatic refund API — flag it for manual action)
    console.warn("REFUND_NEEDED: holds expired before IPN arrived for tran_id:", tranId);
    await admin.from("payment_refund_queue").insert({
      tran_id: tranId,
      reason: "holds_expired",
      amount,
      currency,
      created_at: new Date().toISOString(),
    }).throwOnError().catch(() => {
      // Table may not exist yet — at minimum the log above will alert you
      console.error("Could not insert into refund queue — add table or handle manually");
    });
    await admin.rpc("release_cart_by_session", { _session_id: tranId });
    return new Response("OK", { status: 200 });
  }

  // Mint tickets
  const { error } = await admin.rpc("checkout_paid_cart", { _session_id: tranId });
  if (error) {
    console.error("checkout_paid_cart failed:", error);
    return new Response("Ticket minting failed", { status: 500 });
  }

  console.log("Tickets minted for tran_id:", tranId);
  return new Response("OK", { status: 200 });
});
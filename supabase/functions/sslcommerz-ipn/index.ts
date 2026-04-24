// SSLCommerz IPN (Instant Payment Notification) handler.
// Validates the transaction with SSLCommerz, then mints tickets atomically
// via checkout_paid_cart. Releases held seats on failure/cancel/expired holds.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ct = req.headers.get("content-type") ?? "";
    let payload: Record<string, string> = {};

    if (ct.includes("application/json")) {
      payload = await req.json();
    } else {
      const text = await req.text();
      const params = new URLSearchParams(text);
      params.forEach((v, k) => (payload[k] = v));
    }

    const tranId = payload.tran_id;
    const valId = payload.val_id;
    const status = payload.status;

    if (!tranId) {
      return new Response("Missing tran_id", { status: 400 });
    }

    console.log("SSLCommerz IPN:", { tranId, status, valId });

    if (status !== "VALID" && status !== "VALIDATED") {
      // Failed/cancelled — free held seats
      await admin.rpc("release_cart_by_session", { _session_id: tranId });
      return new Response(JSON.stringify({ ok: true, released: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await processValidPayment(tranId, valId);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sslcommerz-ipn error", e);
    return new Response(`Handler error: ${(e as Error).message}`, { status: 500 });
  }
});

async function processValidPayment(tranId: string, valId: string | undefined) {
  // Verify with SSLCommerz validator API
  const storeId = Deno.env.get("SSLCOMMERZ_STORE_ID")!;
  const storePassword = Deno.env.get("SSLCOMMERZ_STORE_PASSWORD")!;
  const isLive = (Deno.env.get("SSLCOMMERZ_IS_LIVE") ?? "false").toLowerCase() === "true";
  const baseUrl = isLive
    ? "https://securepay.sslcommerz.com"
    : "https://sandbox.sslcommerz.com";

  if (valId) {
    const url = `${baseUrl}/validator/api/validationserverAPI.php?val_id=${encodeURIComponent(
      valId
    )}&store_id=${encodeURIComponent(storeId)}&store_passwd=${encodeURIComponent(
      storePassword
    )}&format=json`;
    const r = await fetch(url);
    const j = await r.json();
    if (j.status !== "VALID" && j.status !== "VALIDATED") {
      console.warn("Validator rejected payment", j);
      await admin.rpc("release_cart_by_session", { _session_id: tranId });
      return;
    }
  }

  // Check holds still alive
  const { data: holds } = await admin
    .from("cart_reservations")
    .select("id, expires_at")
    .eq("payment_session_id", tranId);

  if (!holds || holds.length === 0) {
    console.log("No holds for tran_id, likely already processed:", tranId);
    return;
  }

  const allExpired = holds.every(
    (h: any) => new Date(h.expires_at).getTime() <= Date.now()
  );
  if (allExpired) {
    console.warn("Holds expired before payment landed:", tranId);
    await admin.rpc("release_cart_by_session", { _session_id: tranId });
    // NOTE: SSLCommerz refund flow can be added here if needed.
    return;
  }

  const { error } = await admin.rpc("checkout_paid_cart", { _session_id: tranId });
  if (error) {
    console.error("checkout_paid_cart failed:", error);
    await admin.rpc("release_cart_by_session", { _session_id: tranId });
    throw error;
  }
  console.log("Tickets minted for tran_id:", tranId);
}

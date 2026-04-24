// Browser redirect target for SSLCommerz success/fail/cancel.
// SSLCommerz POSTs form data here, we process it (best-effort) and 302 the
// user back to the SPA. The IPN handler is the source of truth.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const redirect = url.searchParams.get("redirect") ?? "";
  const status = url.searchParams.get("status") ?? "fail";

  let tranId = "";
  let valId = "";
  let payStatus = "";

  if (req.method === "POST") {
    try {
      const text = await req.text();
      const params = new URLSearchParams(text);
      tranId = params.get("tran_id") ?? "";
      valId = params.get("val_id") ?? "";
      payStatus = params.get("status") ?? "";
    } catch (e) {
      console.error("validate parse error", e);
    }
  }

  console.log("SSLCommerz redirect:", { status, tranId, payStatus });

  // Best-effort processing here too (in case IPN is delayed)
  try {
    if (status === "success" && tranId && (payStatus === "VALID" || payStatus === "VALIDATED")) {
      const storeId = Deno.env.get("SSLCOMMERZ_STORE_ID")!;
      const storePassword = Deno.env.get("SSLCOMMERZ_STORE_PASSWORD")!;
      const isLive = (Deno.env.get("SSLCOMMERZ_IS_LIVE") ?? "false").toLowerCase() === "true";
      const baseUrl = isLive
        ? "https://securepay.sslcommerz.com"
        : "https://sandbox.sslcommerz.com";

      if (valId) {
        const v = await fetch(
          `${baseUrl}/validator/api/validationserverAPI.php?val_id=${encodeURIComponent(
            valId
          )}&store_id=${encodeURIComponent(storeId)}&store_passwd=${encodeURIComponent(
            storePassword
          )}&format=json`
        );
        const vj = await v.json();
        if (vj.status === "VALID" || vj.status === "VALIDATED") {
          const { error } = await admin.rpc("checkout_paid_cart", { _session_id: tranId });
          if (error) throw error;
        }
      }
    } else if ((status === "fail" || status === "cancel") && tranId) {
      const { error } = await admin.rpc("release_cart_by_session", { _session_id: tranId });
      if (error) throw error;
    }
  } catch (e) {
    console.error("validate processing error (non-fatal):", e);
  }

  const target = status === "success"
    ? `${redirect}/checkout/success?tran_id=${encodeURIComponent(tranId)}&val_id=${encodeURIComponent(valId)}`
    : `${redirect}/checkout/cancel?tran_id=${encodeURIComponent(tranId)}`;

  return new Response(null, {
    status: 302,
    headers: { Location: target },
  });
});

// Browser-facing redirect handler for SSLCommerz success / fail / cancel.
// SSLCommerz POSTs form data to these URLs from the user's browser.
// We validate the payment (for success) then redirect to the React frontend.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const VALIDATE_SANDBOX = "https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php";
const VALIDATE_LIVE    = "https://securepay.sslcommerz.com/validator/api/validationserverAPI.php";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  const url    = new URL(req.url);
  const type   = url.searchParams.get("type") ?? "fail"; // success | fail | cancel
  const origin = url.searchParams.get("origin") ?? "";

  const formData = await req.formData().catch(() => new FormData());
  const tranId   = formData.get("tran_id") as string | null;
  const valId    = formData.get("val_id") as string | null;

  const redirect = (path: string) =>
    new Response(null, {
      status: 302,
      headers: { Location: `${origin}${path}` },
    });

  if (type === "cancel") {
    if (tranId) await admin.rpc("release_cart_by_session", { _session_id: tranId });
    return redirect("/checkout/cancel");
  }

  if (type === "fail") {
    if (tranId) await admin.rpc("release_cart_by_session", { _session_id: tranId });
    return redirect("/checkout/fail");
  }

  // type === "success" — validate before showing success page
  if (!tranId || !valId) return redirect("/checkout/fail");

  const storeId     = Deno.env.get("SSLCOMMERZ_STORE_ID")!;
  const storePasswd = Deno.env.get("SSLCOMMERZ_STORE_PASSWORD")!;
  const isLive      = Deno.env.get("SSLCOMMERZ_IS_LIVE") === "true";
  const validateUrl = isLive ? VALIDATE_LIVE : VALIDATE_SANDBOX;

  try {
    const validateRes = await fetch(
      `${validateUrl}?val_id=${valId}&store_id=${storeId}&store_passwd=${storePasswd}&format=json`
    );
    const validation = await validateRes.json();

    if (validation.status === "VALID" || validation.status === "VALIDATED") {
      return redirect(`/checkout/success?tran_id=${tranId}`);
    }
  } catch (e) {
    console.error("Redirect validation error", e);
  }

  return redirect("/checkout/fail");
});
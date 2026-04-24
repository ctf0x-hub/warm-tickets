// Initiates an SSLCommerz payment session for the user's active cart holds.
// Stamps each reservation with the SSLCommerz tran_id so the IPN/validator
// can mint tickets for the right cart.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;
    const admin = createClient(supabaseUrl, serviceKey);

    // Load active reservations
    const { data: reservations, error: rErr } = await admin
      .from("cart_reservations")
      .select(
        "id, quantity, expires_at, tier_id, ticket_tiers!inner(name, price_cents, currency, event_id, events!inner(title))"
      )
      .eq("user_id", user.id)
      .gt("expires_at", new Date().toISOString());

    if (rErr) throw rErr;
    if (!reservations || reservations.length === 0) {
      return new Response(JSON.stringify({ error: "Cart is empty" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalCents = reservations.reduce(
      (s: number, r: any) => s + (r.ticket_tiers.price_cents ?? 0) * r.quantity,
      0
    );
    if (totalCents <= 0) {
      return new Response(
        JSON.stringify({ error: "Free carts should use the instant reserve flow" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const storeId = Deno.env.get("SSLCOMMERZ_STORE_ID")!;
    const storePassword = Deno.env.get("SSLCOMMERZ_STORE_PASSWORD")!;
    const isLive = (Deno.env.get("SSLCOMMERZ_IS_LIVE") ?? "false").toLowerCase() === "true";

    const baseUrl = isLive
      ? "https://securepay.sslcommerz.com"
      : "https://sandbox.sslcommerz.com";

    const currency = ((reservations[0] as any).ticket_tiers.currency ?? "BDT").toUpperCase();
    const totalAmount = (totalCents / 100).toFixed(2);

    // Unique transaction id we control (also used as our session id)
    const tranId = `pulse_${user.id.slice(0, 8)}_${Date.now()}`;

    const origin = req.headers.get("origin") ?? "";
    const projectRef = supabaseUrl.split("//")[1].split(".")[0];
    const fnBase = `https://${projectRef}.supabase.co/functions/v1`;

    const productNames = reservations
      .map((r: any) => `${r.ticket_tiers.events.title} - ${r.ticket_tiers.name} x${r.quantity}`)
      .join("; ")
      .slice(0, 250);

    const form = new URLSearchParams({
      store_id: storeId,
      store_passwd: storePassword,
      total_amount: totalAmount,
      currency,
      tran_id: tranId,
      success_url: `${fnBase}/sslcommerz-validate?redirect=${encodeURIComponent(origin)}&status=success`,
      fail_url: `${fnBase}/sslcommerz-validate?redirect=${encodeURIComponent(origin)}&status=fail`,
      cancel_url: `${fnBase}/sslcommerz-validate?redirect=${encodeURIComponent(origin)}&status=cancel`,
      ipn_url: `${fnBase}/sslcommerz-ipn`,
      shipping_method: "NO",
      product_name: productNames || "Event Tickets",
      product_category: "Tickets",
      product_profile: "general",
      cus_name: user.user_metadata?.name ?? user.email ?? "Customer",
      cus_email: user.email ?? "noreply@example.com",
      cus_add1: "N/A",
      cus_city: "N/A",
      cus_country: "Bangladesh",
      cus_phone: "01700000000",
    });

    const initRes = await fetch(`${baseUrl}/gwprocess/v4/api.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const initJson = await initRes.json();

    if (initJson.status !== "SUCCESS" || !initJson.GatewayPageURL) {
      console.error("SSLCommerz init failed", initJson);
      return new Response(
        JSON.stringify({ error: initJson.failedreason ?? "Failed to initiate payment" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Stamp reservations with our tran_id, mirror into payment_session_id,
    // and extend the hold while the customer completes payment.
    const ids = reservations.map((r: any) => r.id);
    const paymentHoldUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { error: updateErr } = await admin
      .from("cart_reservations")
      .update({
        payment_session_id: tranId,
        sslcommerz_tran_id: tranId,
        expires_at: paymentHoldUntil,
      })
      .in("id", ids);
    if (updateErr) throw updateErr;

    return new Response(
      JSON.stringify({ url: initJson.GatewayPageURL, tran_id: tranId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("create-checkout error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

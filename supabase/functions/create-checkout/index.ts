// Initiates an SSLCommerz payment for the authenticated user's active cart.
// Stamps each reservation with the tran_id so the IPN can mint tickets.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SSLCZ_SANDBOX = "https://sandbox.sslcommerz.com/gwprocess/v4/api.php";
const SSLCZ_LIVE    = "https://securepay.sslcommerz.com/gwprocess/v4/api.php";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader)
      return json({ error: "Missing authorization" }, 401);

    const supabaseUrl  = Deno.env.get("SUPABASE_URL")!;
    const anonKey      = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const storeId      = Deno.env.get("SSLCOMMERZ_STORE_ID")!;
    const storePasswd  = Deno.env.get("SSLCOMMERZ_STORE_PASSWORD")!;
    const isLive       = Deno.env.get("SSLCOMMERZ_IS_LIVE") === "true";

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const user = userData.user;

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: reservations, error: rErr } = await admin
      .from("cart_reservations")
      .select(
        "id, quantity, expires_at, tier_id, ticket_tiers!inner(name, price_cents, currency, event_id, events!inner(title))"
      )
      .eq("user_id", user.id)
      .gt("expires_at", new Date().toISOString());

    if (rErr) throw rErr;
    if (!reservations || reservations.length === 0)
      return json({ error: "Cart is empty" }, 400);

    const totalCents = reservations.reduce(
      (s: number, r: any) => s + (r.ticket_tiers.price_cents ?? 0) * r.quantity,
      0
    );
    if (totalCents <= 0)
      return json({ error: "Free carts should use the instant reserve flow" }, 400);

    const currency    = (reservations[0] as any).ticket_tiers.currency?.toUpperCase() ?? "BDT";
    const totalAmount = (totalCents / 100).toFixed(2); // SSLCommerz wants actual amount, not cents
    const tranId      = `TXN_${Date.now()}_${user.id.slice(0, 8)}`;

    const productName = reservations
      .map((r: any) => `${r.ticket_tiers.events.title} — ${r.ticket_tiers.name} ×${r.quantity}`)
      .join(", ")
      .slice(0, 255); // SSLCommerz has a length limit

    // The redirect/IPN functions need the origin to send the user back to the right frontend
    const origin        = req.headers.get("origin") ?? "";
    const functionBase  = `${supabaseUrl}/functions/v1`;

    const payload = new URLSearchParams({
      store_id:         storeId,
      store_passwd:     storePasswd,
      total_amount:     totalAmount,
      currency,
      tran_id:          tranId,

      // Browser redirect URLs — go to our edge function which validates then redirects to frontend
      success_url: `${functionBase}/sslcommerz-redirect?type=success&origin=${encodeURIComponent(origin)}`,
      fail_url:    `${functionBase}/sslcommerz-redirect?type=fail&origin=${encodeURIComponent(origin)}`,
      cancel_url:  `${functionBase}/sslcommerz-redirect?type=cancel&origin=${encodeURIComponent(origin)}`,

      // Server-to-server IPN — fires regardless of browser
      ipn_url: `${functionBase}/sslcommerz-ipn`,

      // Customer info (SSLCommerz requires these)
      cus_name:    user.user_metadata?.full_name ?? user.email ?? "Customer",
      cus_email:   user.email ?? "",
      cus_phone:   user.user_metadata?.phone ?? "N/A",
      cus_add1:    "N/A",
      cus_city:    "Dhaka",
      cus_country: "Bangladesh",

      // Product info
      product_name:     productName,
      product_category: "Tickets",
      product_profile:  "general",
      num_of_item:      String(reservations.reduce((s: number, r: any) => s + r.quantity, 0)),
      shipping_method:  "NO",
    });

    const sslczUrl = isLive ? SSLCZ_LIVE : SSLCZ_SANDBOX;
    const sslczRes = await fetch(sslczUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: payload.toString(),
    });

    const sslczData = await sslczRes.json();
    if (!sslczData.GatewayPageURL) {
      console.error("SSLCommerz init failed", sslczData);
      throw new Error(sslczData.failedreason ?? "SSLCommerz init failed");
    }

    // Stamp reservations with tran_id (same role stripe_session_id had)
    const ids = reservations.map((r: any) => r.id);
    const { error: updateErr } = await admin
      .from("cart_reservations")
      .update({ payment_session_id: tranId })
      .in("id", ids);
    if (updateErr) throw updateErr;

    return json({ url: sslczData.GatewayPageURL, tran_id: tranId });
  } catch (e) {
    console.error("create-checkout error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" } as Record<string, string>,
  });
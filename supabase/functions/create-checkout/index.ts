// Creates a Stripe Checkout Session for the authenticated user's active cart holds.
// Stamps each reservation with the session id so the webhook can mint tickets.
import Stripe from "npm:stripe@17.5.0";
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

    // user-scoped client (validates JWT)
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

    // service client for trusted writes (stamping session id)
    const admin = createClient(supabaseUrl, serviceKey);

    // Load active reservations for this user with tier + event info
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

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2024-11-20.acacia",
    });

    // Reuse a customer if one exists for this email
    let customerId: string | undefined;
    const existing = await stripe.customers.list({ email: user.email!, limit: 1 });
    if (existing.data.length > 0) customerId = existing.data[0].id;

    const currency = (reservations[0] as any).ticket_tiers.currency?.toLowerCase() ?? "usd";

    const line_items = reservations.map((r: any) => ({
      quantity: r.quantity,
      price_data: {
        currency,
        unit_amount: r.ticket_tiers.price_cents,
        product_data: {
          name: `${r.ticket_tiers.events.title} — ${r.ticket_tiers.name}`,
        },
      },
    }));

    const origin = req.headers.get("origin") ?? "";

    // Cap session expiry to the soonest hold expiry (Stripe min 30 min, max 24h)
    const minExpiry = Math.min(
      ...reservations.map((r: any) => new Date(r.expires_at).getTime())
    );
    const expiresAt = Math.max(
      Math.floor(Date.now() / 1000) + 30 * 60,
      Math.floor(minExpiry / 1000)
    );

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items,
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout/cancel?session_id={CHECKOUT_SESSION_ID}`,
      expires_at: expiresAt,
      metadata: { user_id: user.id },
    });

    // Stamp the reservations with this session id
    const ids = reservations.map((r: any) => r.id);
    const { error: updateErr } = await admin
      .from("cart_reservations")
      .update({ stripe_session_id: session.id })
      .in("id", ids);
    if (updateErr) throw updateErr;

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("create-checkout error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

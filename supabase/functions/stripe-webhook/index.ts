// Handles Stripe webhook events:
// - checkout.session.completed: mint tickets via checkout_paid_cart RPC
//   If the 5-min hold expired before payment landed, refund automatically.
// - checkout.session.expired / async_payment_failed: free the held seats.
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-11-20.acacia",
});

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sig = req.headers.get("stripe-signature");
  const whSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!sig || !whSecret) {
    return new Response("Missing signature or webhook secret", { status: 400 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, sig, whSecret);
  } catch (e) {
    console.error("Bad signature", e);
    return new Response(`Bad signature: ${(e as Error).message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handlePaid(session);
        break;
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await admin.rpc("release_cart_by_session", { _session_id: session.id });
        break;
      }
      default:
        // ignore others
        break;
    }
  } catch (e) {
    console.error("webhook handler error", e);
    return new Response(`Handler error: ${(e as Error).message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function handlePaid(session: Stripe.Checkout.Session) {
  // Check if reservations still exist and haven't expired
  const { data: holds } = await admin
    .from("cart_reservations")
    .select("id, expires_at")
    .eq("stripe_session_id", session.id);

  if (!holds || holds.length === 0) {
    // Already processed (idempotent) — nothing to do
    console.log("No holds for session, likely already processed:", session.id);
    return;
  }

  const now = Date.now();
  const allExpired = holds.every((h) => new Date(h.expires_at).getTime() <= now);

  if (allExpired) {
    // Holds expired before payment arrived — refund.
    console.warn("Holds expired before payment, refunding session:", session.id);
    if (session.payment_intent) {
      try {
        await stripe.refunds.create({
          payment_intent: session.payment_intent as string,
          reason: "requested_by_customer",
        });
      } catch (e) {
        console.error("Refund failed", e);
      }
    }
    await admin.rpc("release_cart_by_session", { _session_id: session.id });
    return;
  }

  // Mint tickets atomically
  const { error } = await admin.rpc("checkout_paid_cart", { _session_id: session.id });
  if (error) {
    console.error("checkout_paid_cart failed, refunding:", error);
    if (session.payment_intent) {
      try {
        await stripe.refunds.create({
          payment_intent: session.payment_intent as string,
          reason: "requested_by_customer",
        });
      } catch (e) {
        console.error("Refund failed", e);
      }
    }
    await admin.rpc("release_cart_by_session", { _session_id: session.id });
    throw error;
  }
  console.log("Tickets minted for session:", session.id);
}

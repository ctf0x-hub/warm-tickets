import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const { tran_id: tranId, val_id: valId } = await req.json();
    if (!tranId || typeof tranId !== "string") {
      return json({ error: "tran_id is required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const user = userData.user;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: existingTickets, error: ticketsError } = await admin
      .from("tickets")
      .select("id")
      .eq("user_id", user.id)
      .eq("payment_ref", tranId)
      .limit(10);

    if (ticketsError) throw ticketsError;
    if (existingTickets && existingTickets.length > 0) {
      return json({ status: "confirmed", count: existingTickets.length });
    }

    const { data: reservations, error: reservationsError } = await admin
      .from("cart_reservations")
      .select("id, expires_at")
      .eq("user_id", user.id)
      .eq("payment_session_id", tranId);

    if (reservationsError) throw reservationsError;

    if (!reservations || reservations.length === 0) {
      return json({ status: "not_found" });
    }

    const allExpired = reservations.every((reservation) =>
      new Date(reservation.expires_at).getTime() <= Date.now()
    );

    if (allExpired) {
      await admin.rpc("release_cart_by_session", { _session_id: tranId });
      return json({ status: "expired" });
    }

    if (!valId || typeof valId !== "string") {
      return json({ status: "processing" });
    }

    const storeId = Deno.env.get("SSLCOMMERZ_STORE_ID")!;
    const storePassword = Deno.env.get("SSLCOMMERZ_STORE_PASSWORD")!;
    const isLive = (Deno.env.get("SSLCOMMERZ_IS_LIVE") ?? "false").toLowerCase() === "true";
    const baseUrl = isLive
      ? "https://securepay.sslcommerz.com"
      : "https://sandbox.sslcommerz.com";

    const validatorResponse = await fetch(
      `${baseUrl}/validator/api/validationserverAPI.php?val_id=${encodeURIComponent(
        valId
      )}&store_id=${encodeURIComponent(storeId)}&store_passwd=${encodeURIComponent(
        storePassword
      )}&format=json`
    );
    const validatorJson = await validatorResponse.json();

    if (validatorJson.status !== "VALID" && validatorJson.status !== "VALIDATED") {
      await admin.rpc("release_cart_by_session", { _session_id: tranId });
      return json({ status: "failed", provider_status: validatorJson.status ?? null });
    }

    const { error: checkoutError } = await admin.rpc("checkout_paid_cart", { _session_id: tranId });
    if (checkoutError) throw checkoutError;

    const { data: confirmedTickets, error: confirmedTicketsError } = await admin
      .from("tickets")
      .select("id")
      .eq("user_id", user.id)
      .eq("payment_ref", tranId)
      .limit(10);

    if (confirmedTicketsError) throw confirmedTicketsError;

    return json({
      status: confirmedTickets && confirmedTickets.length > 0 ? "confirmed" : "processing",
      count: confirmedTickets?.length ?? 0,
    });
  } catch (error) {
    console.error("check-payment-status error", error);
    return json({ error: (error as Error).message }, 500);
  }
});

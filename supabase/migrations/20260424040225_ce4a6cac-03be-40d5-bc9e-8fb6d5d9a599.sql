CREATE OR REPLACE FUNCTION public.checkout_paid_cart(_session_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  tier RECORD;
  i INTEGER;
BEGIN
  FOR r IN
    SELECT cr.* FROM public.cart_reservations cr
    WHERE cr.payment_session_id = _session_id
    FOR UPDATE
  LOOP
    SELECT t.*, e.status AS event_status, e.deleted_at AS event_deleted
      INTO tier
      FROM public.ticket_tiers t
      JOIN public.events e ON e.id = t.event_id
     WHERE t.id = r.tier_id
     FOR UPDATE;

    IF tier.sold_seats + r.quantity > tier.total_seats THEN
      RAISE EXCEPTION 'Not enough seats remaining for "%"', tier.name;
    END IF;

    UPDATE public.ticket_tiers
       SET sold_seats = sold_seats + r.quantity
     WHERE id = tier.id;

    FOR i IN 1..r.quantity LOOP
      INSERT INTO public.tickets (event_id, tier_id, user_id, payment_ref)
      VALUES (tier.event_id, tier.id, r.user_id, _session_id);
    END LOOP;
  END LOOP;

  DELETE FROM public.cart_reservations WHERE payment_session_id = _session_id;
END;
$function$;
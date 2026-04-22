-- Allow "approved" events to be publicly visible alongside "published"
DROP POLICY IF EXISTS "Anyone reads published events" ON public.events;
CREATE POLICY "Anyone reads public events"
  ON public.events FOR SELECT
  USING (status IN ('published', 'approved') AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Anyone reads tiers for published events" ON public.ticket_tiers;
CREATE POLICY "Anyone reads tiers for public events"
  ON public.ticket_tiers FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = ticket_tiers.event_id
      AND e.status IN ('published', 'approved')
      AND e.deleted_at IS NULL
  ));

DROP POLICY IF EXISTS "Anyone reads tag_map for published events" ON public.event_tag_map;
CREATE POLICY "Anyone reads tag_map for public events"
  ON public.event_tag_map FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_tag_map.event_id
      AND e.status IN ('published', 'approved')
      AND e.deleted_at IS NULL
  ));

-- Update paid checkout to allow approved events
CREATE OR REPLACE FUNCTION public.checkout_paid_cart(_session_id text)
 RETURNS SETOF public.tickets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  tier RECORD;
  i INTEGER;
  uid UUID;
BEGIN
  SELECT user_id INTO uid
  FROM public.cart_reservations
  WHERE stripe_session_id = _session_id
  LIMIT 1;

  IF uid IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT cr.* FROM public.cart_reservations cr
    WHERE cr.stripe_session_id = _session_id
    FOR UPDATE
  LOOP
    SELECT t.*, e.status AS event_status, e.deleted_at AS event_deleted
    INTO tier
    FROM public.ticket_tiers t
    JOIN public.events e ON e.id = t.event_id
    WHERE t.id = r.tier_id FOR UPDATE;

    IF tier.event_status NOT IN ('published', 'approved') OR tier.event_deleted IS NOT NULL THEN
      RAISE EXCEPTION 'Event no longer available';
    END IF;
    IF tier.sold_seats + r.quantity > tier.total_seats THEN
      RAISE EXCEPTION 'Not enough seats remaining for "%"', tier.name;
    END IF;

    UPDATE public.ticket_tiers
       SET sold_seats = sold_seats + r.quantity
     WHERE id = tier.id;

    FOR i IN 1..r.quantity LOOP
      RETURN QUERY
        INSERT INTO public.tickets (event_id, tier_id, user_id)
        VALUES (tier.event_id, tier.id, uid)
        RETURNING *;
    END LOOP;
  END LOOP;

  DELETE FROM public.cart_reservations WHERE stripe_session_id = _session_id;
END;
$function$;

-- Update free checkout similarly
CREATE OR REPLACE FUNCTION public.checkout_cart()
 RETURNS SETOF public.tickets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  tier RECORD;
  i INTEGER;
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  FOR r IN
    SELECT cr.* FROM public.cart_reservations cr
    WHERE cr.user_id = uid AND cr.expires_at > now()
    FOR UPDATE
  LOOP
    SELECT t.*, e.status AS event_status, e.deleted_at AS event_deleted
    INTO tier
    FROM public.ticket_tiers t
    JOIN public.events e ON e.id = t.event_id
    WHERE t.id = r.tier_id FOR UPDATE;

    IF tier.event_status NOT IN ('published', 'approved') OR tier.event_deleted IS NOT NULL THEN
      RAISE EXCEPTION 'Event no longer available';
    END IF;
    IF tier.sales_start_at IS NOT NULL AND tier.sales_start_at > now() THEN
      RAISE EXCEPTION 'Sales for "%" have not started', tier.name;
    END IF;
    IF tier.sales_end_at IS NOT NULL AND tier.sales_end_at < now() THEN
      RAISE EXCEPTION 'Sales for "%" have ended', tier.name;
    END IF;
    IF tier.sold_seats + r.quantity > tier.total_seats THEN
      RAISE EXCEPTION 'Not enough seats remaining for "%"', tier.name;
    END IF;

    UPDATE public.ticket_tiers SET sold_seats = sold_seats + r.quantity WHERE id = tier.id;

    FOR i IN 1..r.quantity LOOP
      RETURN QUERY
        INSERT INTO public.tickets (event_id, tier_id, user_id)
        VALUES (tier.event_id, tier.id, uid)
        RETURNING *;
    END LOOP;
  END LOOP;

  DELETE FROM public.cart_reservations WHERE user_id = uid;
END;
$function$;
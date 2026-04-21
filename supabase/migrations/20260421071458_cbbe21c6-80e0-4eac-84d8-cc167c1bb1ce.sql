
ALTER TABLE public.cart_reservations
  ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;

CREATE INDEX IF NOT EXISTS cart_reservations_stripe_session_idx
  ON public.cart_reservations(stripe_session_id);

-- Mint tickets for a paid Stripe session. Called from the webhook with the service role.
CREATE OR REPLACE FUNCTION public.checkout_paid_cart(_session_id TEXT)
RETURNS SETOF public.tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  tier RECORD;
  i INTEGER;
  uid UUID;
BEGIN
  -- Resolve the owner of this session (all holds in a session belong to one user)
  SELECT user_id INTO uid
  FROM public.cart_reservations
  WHERE stripe_session_id = _session_id
  LIMIT 1;

  IF uid IS NULL THEN
    -- Either already processed or never existed; nothing to do
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

    IF tier.event_status <> 'published' OR tier.event_deleted IS NOT NULL THEN
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
$$;

-- Release holds tied to a session (used on session expiry / cancellation)
CREATE OR REPLACE FUNCTION public.release_cart_by_session(_session_id TEXT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.cart_reservations WHERE stripe_session_id = _session_id;
$$;

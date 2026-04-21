
-- Enums
CREATE TYPE public.ticket_status AS ENUM ('valid', 'cancelled', 'checked_in');

-- ticket_tiers
CREATE TABLE public.ticket_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  total_seats INTEGER NOT NULL CHECK (total_seats >= 0),
  sold_seats INTEGER NOT NULL DEFAULT 0 CHECK (sold_seats >= 0),
  sales_start_at TIMESTAMPTZ,
  sales_end_at TIMESTAMPTZ,
  max_per_order INTEGER NOT NULL DEFAULT 10 CHECK (max_per_order > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ticket_tiers_event ON public.ticket_tiers(event_id);

ALTER TABLE public.ticket_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads tiers for published events" ON public.ticket_tiers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.events e
      WHERE e.id = event_id AND e.status = 'published' AND e.deleted_at IS NULL)
  );
CREATE POLICY "Organizers read own tiers" ON public.ticket_tiers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organizer_id = auth.uid())
  );
CREATE POLICY "Organizers manage own tiers" ON public.ticket_tiers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organizer_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organizer_id = auth.uid())
  );
CREATE POLICY "Admins manage all tiers" ON public.ticket_tiers
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_ticket_tiers_updated
  BEFORE UPDATE ON public.ticket_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- cart_reservations
CREATE TABLE public.cart_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tier_id UUID NOT NULL REFERENCES public.ticket_tiers(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cart_user ON public.cart_reservations(user_id);
CREATE INDEX idx_cart_tier_active ON public.cart_reservations(tier_id, expires_at);

ALTER TABLE public.cart_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own reservations" ON public.cart_reservations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Anyone reads active reservations" ON public.cart_reservations
  FOR SELECT USING (expires_at > now());

-- tickets
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  tier_id UUID NOT NULL REFERENCES public.ticket_tiers(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL,
  qr_code TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  status public.ticket_status NOT NULL DEFAULT 'valid',
  checked_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tickets_user ON public.tickets(user_id);
CREATE INDEX idx_tickets_event ON public.tickets(event_id);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own tickets" ON public.tickets
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Organizers view event tickets" ON public.tickets
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organizer_id = auth.uid())
  );
CREATE POLICY "Admins view all tickets" ON public.tickets
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Organizers update event tickets" ON public.tickets
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organizer_id = auth.uid())
  );

-- available_seats helper
CREATE OR REPLACE FUNCTION public.available_seats(_tier_id UUID)
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT GREATEST(0,
    t.total_seats - t.sold_seats -
    COALESCE((
      SELECT SUM(quantity)::INTEGER FROM public.cart_reservations r
      WHERE r.tier_id = t.id AND r.expires_at > now()
    ), 0)
  )
  FROM public.ticket_tiers t WHERE t.id = _tier_id;
$$;

-- expire_stale_reservations
CREATE OR REPLACE FUNCTION public.expire_stale_reservations()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.cart_reservations WHERE expires_at <= now();
$$;

-- checkout_cart: atomic convert holds -> tickets
CREATE OR REPLACE FUNCTION public.checkout_cart()
RETURNS SETOF public.tickets
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  tier RECORD;
  i INTEGER;
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Lock the user's active reservations
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

    IF tier.event_status <> 'published' OR tier.event_deleted IS NOT NULL THEN
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
$$;

-- Realtime
ALTER TABLE public.ticket_tiers REPLICA IDENTITY FULL;
ALTER TABLE public.cart_reservations REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_tiers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cart_reservations;

-- Cron cleanup every minute
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule(
  'expire-stale-reservations',
  '* * * * *',
  $$ SELECT public.expire_stale_reservations(); $$
);

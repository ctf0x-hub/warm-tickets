
-- 1. Track who scanned (nullable; backfill not needed)
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS checked_in_by UUID;

-- 2. Staff table
CREATE TABLE IF NOT EXISTS public.event_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  invited_email TEXT NOT NULL,
  added_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS event_staff_user_idx ON public.event_staff(user_id);
CREATE INDEX IF NOT EXISTS event_staff_event_idx ON public.event_staff(event_id);

ALTER TABLE public.event_staff ENABLE ROW LEVEL SECURITY;

-- Helper: is the caller staff for this event?
CREATE OR REPLACE FUNCTION public.is_event_staff(_event_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.event_staff
    WHERE event_id = _event_id AND user_id = _user_id
  );
$$;

-- Helper: can this user scan tickets for an event? (organizer / admin / staff)
CREATE OR REPLACE FUNCTION public.can_scan_event(_event_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin')
    OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = _event_id AND e.organizer_id = _user_id)
    OR EXISTS (SELECT 1 FROM public.event_staff s WHERE s.event_id = _event_id AND s.user_id = _user_id);
$$;

-- RLS for event_staff
CREATE POLICY "Organizers manage own event staff"
  ON public.event_staff FOR ALL
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_staff.event_id AND e.organizer_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_staff.event_id AND e.organizer_id = auth.uid()));

CREATE POLICY "Admins manage all event staff"
  ON public.event_staff FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff view own assignments"
  ON public.event_staff FOR SELECT
  USING (user_id = auth.uid());

-- 3. Extend ticket access for staff
CREATE POLICY "Staff view event tickets"
  ON public.tickets FOR SELECT
  USING (public.is_event_staff(event_id, auth.uid()));

CREATE POLICY "Staff update event tickets"
  ON public.tickets FOR UPDATE
  USING (public.is_event_staff(event_id, auth.uid()));

-- 4. Atomic check-in function
CREATE OR REPLACE FUNCTION public.check_in_ticket(_qr_code TEXT, _event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  t RECORD;
  attendee_email TEXT;
  tier_name TEXT;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unauth', 'message', 'Not authenticated');
  END IF;

  IF NOT public.can_scan_event(_event_id, uid) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'message', 'You are not authorized to scan this event');
  END IF;

  SELECT * INTO t FROM public.tickets WHERE qr_code = _qr_code FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Ticket not found');
  END IF;

  IF t.event_id <> _event_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'wrong_event', 'message', 'Ticket belongs to a different event');
  END IF;

  IF t.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'cancelled', 'message', 'Ticket has been cancelled');
  END IF;

  IF t.status = 'checked_in' OR t.checked_in_at IS NOT NULL THEN
    SELECT p.email INTO attendee_email FROM public.profiles p WHERE p.user_id = t.user_id;
    SELECT tt.name INTO tier_name FROM public.ticket_tiers tt WHERE tt.id = t.tier_id;
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'already_checked_in',
      'message', 'Already checked in',
      'checked_in_at', t.checked_in_at,
      'attendee_email', attendee_email,
      'tier_name', tier_name
    );
  END IF;

  UPDATE public.tickets
     SET status = 'checked_in',
         checked_in_at = now(),
         checked_in_by = uid
   WHERE id = t.id;

  SELECT p.email INTO attendee_email FROM public.profiles p WHERE p.user_id = t.user_id;
  SELECT tt.name INTO tier_name FROM public.ticket_tiers tt WHERE tt.id = t.tier_id;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'checked_in',
    'message', 'Checked in',
    'attendee_email', attendee_email,
    'tier_name', tier_name,
    'ticket_id', t.id
  );
END;
$$;

-- 5. Helper to add a staff member by email (resolves email -> user_id via profiles)
CREATE OR REPLACE FUNCTION public.add_event_staff_by_email(_event_id UUID, _email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  target_user UUID;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Not authenticated');
  END IF;

  IF NOT (public.has_role(uid, 'admin')
          OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = _event_id AND e.organizer_id = uid)) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Forbidden');
  END IF;

  SELECT user_id INTO target_user FROM public.profiles WHERE lower(email) = lower(_email) LIMIT 1;

  IF target_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'No user found with that email. They must sign up first.');
  END IF;

  INSERT INTO public.event_staff (event_id, user_id, invited_email, added_by)
  VALUES (_event_id, target_user, _email, uid)
  ON CONFLICT (event_id, user_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'user_id', target_user);
END;
$$;

-- Checkpoints (top-level entry points per event) and booths (lanes within a checkpoint)
CREATE TABLE public.event_checkpoints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_event_checkpoints_event ON public.event_checkpoints(event_id);

CREATE TABLE public.event_booths (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  checkpoint_id UUID NOT NULL REFERENCES public.event_checkpoints(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_event_booths_checkpoint ON public.event_booths(checkpoint_id);

ALTER TABLE public.event_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_booths ENABLE ROW LEVEL SECURITY;

-- Checkpoint policies: organizers manage their event's checkpoints; admins manage all; staff/scanners can read.
CREATE POLICY "Admins manage all checkpoints"
ON public.event_checkpoints FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Organizers manage own event checkpoints"
ON public.event_checkpoints FOR ALL
USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_checkpoints.event_id AND e.organizer_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_checkpoints.event_id AND e.organizer_id = auth.uid()));

CREATE POLICY "Scanners read event checkpoints"
ON public.event_checkpoints FOR SELECT
USING (public.can_scan_event(event_id, auth.uid()));

-- Booth policies mirror checkpoints via the parent event
CREATE POLICY "Admins manage all booths"
ON public.event_booths FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Organizers manage own event booths"
ON public.event_booths FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.event_checkpoints c
  JOIN public.events e ON e.id = c.event_id
  WHERE c.id = event_booths.checkpoint_id AND e.organizer_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.event_checkpoints c
  JOIN public.events e ON e.id = c.event_id
  WHERE c.id = event_booths.checkpoint_id AND e.organizer_id = auth.uid()
));

CREATE POLICY "Scanners read event booths"
ON public.event_booths FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.event_checkpoints c
  WHERE c.id = event_booths.checkpoint_id AND public.can_scan_event(c.event_id, auth.uid())
));

CREATE TRIGGER trg_checkpoints_updated_at BEFORE UPDATE ON public.event_checkpoints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_booths_updated_at BEFORE UPDATE ON public.event_booths
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Record which checkpoint/booth performed each check-in
ALTER TABLE public.tickets
  ADD COLUMN checkpoint_id UUID REFERENCES public.event_checkpoints(id) ON DELETE SET NULL,
  ADD COLUMN booth_id UUID REFERENCES public.event_booths(id) ON DELETE SET NULL;

-- Update check_in_ticket to accept and persist checkpoint/booth selection
CREATE OR REPLACE FUNCTION public.check_in_ticket(_qr_code text, _event_id uuid, _checkpoint_id uuid DEFAULT NULL, _booth_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Validate checkpoint belongs to event
  IF _checkpoint_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.event_checkpoints WHERE id = _checkpoint_id AND event_id = _event_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_checkpoint', 'message', 'Invalid checkpoint for this event');
  END IF;

  -- Validate booth belongs to checkpoint
  IF _booth_id IS NOT NULL AND (_checkpoint_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.event_booths WHERE id = _booth_id AND checkpoint_id = _checkpoint_id
  )) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_booth', 'message', 'Invalid booth for this checkpoint');
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
         checked_in_by = uid,
         checkpoint_id = _checkpoint_id,
         booth_id = _booth_id
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
$function$;
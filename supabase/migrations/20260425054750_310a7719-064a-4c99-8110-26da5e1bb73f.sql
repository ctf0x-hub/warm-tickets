CREATE OR REPLACE FUNCTION public.check_in_ticket(_qr_code text, _event_id uuid, _checkpoint_id uuid DEFAULT NULL::uuid, _booth_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid UUID := auth.uid();
  t RECORD;
  attendee_email TEXT;
  attendee_name TEXT;
  tier_name TEXT;
  cp_name TEXT;
  prior RECORD;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unauth', 'message', 'Not authenticated');
  END IF;

  IF NOT public.can_scan_event(_event_id, uid) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'message', 'You are not authorized to scan this event');
  END IF;

  IF _checkpoint_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.event_checkpoints WHERE id = _checkpoint_id AND event_id = _event_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_checkpoint', 'message', 'Invalid checkpoint for this event');
  END IF;

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

  SELECT s.scanned_at, c.name AS checkpoint_name
    INTO prior
    FROM public.ticket_scans s
    LEFT JOIN public.event_checkpoints c ON c.id = s.checkpoint_id
   WHERE s.ticket_id = t.id
     AND s.checkpoint_id IS NOT DISTINCT FROM _checkpoint_id
   LIMIT 1;

  SELECT p.email, p.name INTO attendee_email, attendee_name FROM public.profiles p WHERE p.user_id = t.user_id;
  SELECT tt.name INTO tier_name FROM public.ticket_tiers tt WHERE tt.id = t.tier_id;
  SELECT name INTO cp_name FROM public.event_checkpoints WHERE id = _checkpoint_id;

  IF prior.scanned_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'already_checked_in',
      'message', 'Already scanned at ' || COALESCE(prior.checkpoint_name, 'this gate'),
      'checked_in_at', prior.scanned_at,
      'attendee_email', attendee_email,
      'attendee_name', attendee_name,
      'tier_name', tier_name,
      'checkpoint_name', cp_name
    );
  END IF;

  INSERT INTO public.ticket_scans (ticket_id, event_id, checkpoint_id, booth_id, scanned_by)
  VALUES (t.id, _event_id, _checkpoint_id, _booth_id, uid);

  IF t.checked_in_at IS NULL THEN
    UPDATE public.tickets
       SET status = 'checked_in',
           checked_in_at = now(),
           checked_in_by = uid,
           checkpoint_id = _checkpoint_id,
           booth_id = _booth_id
     WHERE id = t.id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'checked_in',
    'message', 'Checked in' || CASE WHEN cp_name IS NOT NULL THEN ' at ' || cp_name ELSE '' END,
    'attendee_email', attendee_email,
    'attendee_name', attendee_name,
    'tier_name', tier_name,
    'checkpoint_name', cp_name,
    'ticket_id', t.id
  );
END;
$function$;
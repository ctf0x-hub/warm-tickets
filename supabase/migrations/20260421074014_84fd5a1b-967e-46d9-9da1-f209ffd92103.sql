
CREATE OR REPLACE FUNCTION public.event_analytics(_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  ev RECORD;
  result JSONB;
  scan_start TIMESTAMPTZ;
  scan_end   TIMESTAMPTZ;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, organizer_id, starts_at, ends_at
    INTO ev FROM public.events WHERE id = _event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  IF NOT (public.has_role(uid, 'admin') OR ev.organizer_id = uid) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Scan window: actual event window if it has started, otherwise last 6h
  IF ev.starts_at <= now() THEN
    scan_start := ev.starts_at;
    scan_end   := LEAST(ev.ends_at, now());
  ELSE
    scan_start := now() - interval '6 hours';
    scan_end   := now();
  END IF;

  WITH
  totals AS (
    SELECT
      COUNT(*) FILTER (WHERE t.status <> 'cancelled')::INT AS sold,
      COUNT(*) FILTER (WHERE t.status = 'checked_in')::INT AS checked_in,
      COUNT(*) FILTER (WHERE t.status = 'cancelled')::INT  AS cancelled,
      COALESCE(SUM(tt.price_cents) FILTER (WHERE t.status <> 'cancelled'), 0)::BIGINT AS gross_cents,
      COALESCE(MAX(tt.currency), 'USD') AS currency
    FROM public.tickets t
    JOIN public.ticket_tiers tt ON tt.id = t.tier_id
    WHERE t.event_id = _event_id
  ),
  sold_series AS (
    SELECT
      to_char(d::date, 'YYYY-MM-DD') AS day,
      COALESCE(SUM(CASE WHEN t.status <> 'cancelled' THEN 1 ELSE 0 END), 0)::INT AS tickets,
      COALESCE(SUM(CASE WHEN t.status <> 'cancelled' THEN tt.price_cents ELSE 0 END), 0)::BIGINT AS revenue_cents
    FROM generate_series((now() - interval '29 days')::date, now()::date, '1 day') d
    LEFT JOIN public.tickets t
      ON t.event_id = _event_id
     AND date_trunc('day', t.created_at) = d
    LEFT JOIN public.ticket_tiers tt ON tt.id = t.tier_id
    GROUP BY d
    ORDER BY d
  ),
  scan_series AS (
    SELECT
      to_char(date_trunc('minute', t.checked_in_at), 'YYYY-MM-DD"T"HH24:MI:00"Z"') AS minute,
      COUNT(*)::INT AS scans
    FROM public.tickets t
    WHERE t.event_id = _event_id
      AND t.checked_in_at IS NOT NULL
      AND t.checked_in_at >= scan_start
      AND t.checked_in_at <= scan_end
    GROUP BY date_trunc('minute', t.checked_in_at)
    ORDER BY date_trunc('minute', t.checked_in_at)
  ),
  tier_rows AS (
    SELECT
      tt.id,
      tt.name,
      tt.total_seats,
      tt.price_cents,
      tt.currency,
      COALESCE(SUM(CASE WHEN t.status <> 'cancelled' THEN 1 ELSE 0 END), 0)::INT AS sold,
      COALESCE(SUM(CASE WHEN t.status = 'checked_in' THEN 1 ELSE 0 END), 0)::INT AS checked_in,
      COALESCE(SUM(CASE WHEN t.status <> 'cancelled' THEN tt.price_cents ELSE 0 END), 0)::BIGINT AS revenue_cents
    FROM public.ticket_tiers tt
    LEFT JOIN public.tickets t ON t.tier_id = tt.id
    WHERE tt.event_id = _event_id
    GROUP BY tt.id
    ORDER BY tt.sort_order, tt.created_at
  )
  SELECT jsonb_build_object(
    'event', jsonb_build_object(
      'id', ev.id,
      'starts_at', ev.starts_at,
      'ends_at', ev.ends_at
    ),
    'totals', (SELECT to_jsonb(totals) FROM totals),
    'sold_series', COALESCE((SELECT jsonb_agg(to_jsonb(sold_series)) FROM sold_series), '[]'::jsonb),
    'scan_series', COALESCE((SELECT jsonb_agg(to_jsonb(scan_series)) FROM scan_series), '[]'::jsonb),
    'tiers',       COALESCE((SELECT jsonb_agg(to_jsonb(tier_rows)) FROM tier_rows), '[]'::jsonb),
    'scan_window', jsonb_build_object('start', scan_start, 'end', scan_end)
  ) INTO result;

  RETURN result;
END;
$$;

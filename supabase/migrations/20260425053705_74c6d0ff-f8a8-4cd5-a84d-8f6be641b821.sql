-- Allow ticket owners to view their own scan history
CREATE POLICY "Users view own ticket scans"
ON public.ticket_scans FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.tickets t
  WHERE t.id = ticket_scans.ticket_id AND t.user_id = auth.uid()
));

-- Allow ticket owners to read checkpoint names for events they have tickets to
CREATE POLICY "Ticket owners read event checkpoints"
ON public.event_checkpoints FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.tickets t
  WHERE t.event_id = event_checkpoints.event_id AND t.user_id = auth.uid()
));
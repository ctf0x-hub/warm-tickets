-- Add terms column to events
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS terms text;

-- Create public storage bucket for event banner images
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-banners', 'event-banners', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: anyone can read; organizers/admins can upload to their own folder (path: <user_id>/...)
CREATE POLICY "Public read event banners"
ON storage.objects FOR SELECT
USING (bucket_id = 'event-banners');

CREATE POLICY "Users upload to own folder in event-banners"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'event-banners'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users update own files in event-banners"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'event-banners'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users delete own files in event-banners"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'event-banners'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
-- Create storage bucket for textbook PDFs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'textbooks',
  'textbooks',
  true,
  524288000,  -- 500MB limit
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for textbooks bucket
-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload PDFs to own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'textbooks'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to read their own PDFs
CREATE POLICY "Users can read own PDFs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'textbooks'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access (for sharing/processing)
CREATE POLICY "Public can read textbook PDFs"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'textbooks');

-- Allow users to delete their own PDFs
CREATE POLICY "Users can delete own PDFs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'textbooks'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

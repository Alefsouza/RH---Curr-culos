DO $$
BEGIN
  -- Insert the bucket if it doesn't exist
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('curriculos', 'curriculos', true, 5242880, '{"application/pdf"}')
  ON CONFLICT (id) DO UPDATE 
  SET public = true, 
      file_size_limit = 5242880, 
      allowed_mime_types = '{"application/pdf"}';
END $$;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Public Upload" ON storage.objects;
DROP POLICY IF EXISTS "Public Read" ON storage.objects;
DROP POLICY IF EXISTS "Auth Update" ON storage.objects;
DROP POLICY IF EXISTS "Auth Delete" ON storage.objects;

-- Create policies for storage.objects
CREATE POLICY "Public Upload" ON storage.objects
  FOR INSERT TO public WITH CHECK (bucket_id = 'curriculos');

CREATE POLICY "Public Read" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'curriculos');

CREATE POLICY "Auth Update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'curriculos');

CREATE POLICY "Auth Delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'curriculos');

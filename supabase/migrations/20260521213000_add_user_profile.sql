-- Add avatar_url column to usuarios
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS avatar_url text;

-- Create avatars bucket if not exists
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true) 
ON CONFLICT (id) DO NOTHING;

-- Avatars Bucket RLS Policies

-- Select: Allow anyone to read avatars
DROP POLICY IF EXISTS "Avatar Read Access" ON storage.objects;
CREATE POLICY "Avatar Read Access" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'avatars');

-- Insert: Allow authenticated users to upload to their own folder path
DROP POLICY IF EXISTS "Avatar Insert Access" ON storage.objects;
CREATE POLICY "Avatar Insert Access" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Update: Allow authenticated users to update their own avatars
DROP POLICY IF EXISTS "Avatar Update Access" ON storage.objects;
CREATE POLICY "Avatar Update Access" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Delete: Allow authenticated users to delete their own avatars
DROP POLICY IF EXISTS "Avatar Delete Access" ON storage.objects;
CREATE POLICY "Avatar Delete Access" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Ensure RLS is active on usuarios (should be true already, but safe to verify)
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

-- Drop existing if any, then recreate policy to allow users to update their own profile
DROP POLICY IF EXISTS "usuarios_update" ON public.usuarios;
CREATE POLICY "usuarios_update" ON public.usuarios
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Make sure select is available
DROP POLICY IF EXISTS "usuarios_select" ON public.usuarios;
CREATE POLICY "usuarios_select" ON public.usuarios
  FOR SELECT TO authenticated USING (auth.uid() = id);

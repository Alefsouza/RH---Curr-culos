DO $$
DECLARE
  seed_user_id UUID;
BEGIN
  -- Seed initial admin user if not exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'financeiro@viasudeste.com') THEN
    seed_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      seed_user_id,
      '00000000-0000-0000-0000-000000000000',
      'financeiro@viasudeste.com',
      crypt('Skip@Pass', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Administrador do Sistema", "is_admin": true}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );
  END IF;

  -- Verify and recreate robust RLS policies for analises table
  DROP POLICY IF EXISTS "analises_select" ON public.analises;
  DROP POLICY IF EXISTS "analises_insert" ON public.analises;
  DROP POLICY IF EXISTS "analises_update" ON public.analises;
  DROP POLICY IF EXISTS "analises_delete" ON public.analises;

  CREATE POLICY "analises_select" ON public.analises
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

  CREATE POLICY "analises_insert" ON public.analises
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

  CREATE POLICY "analises_update" ON public.analises
    FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

  CREATE POLICY "analises_delete" ON public.analises
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

END $$;

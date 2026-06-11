-- Delete premature or empty messages that don't have an external ID
DELETE FROM public.mensagens_whatsapp 
WHERE external_id IS NULL AND uazapi_message_id IS NULL AND direcao = 'enviada';

DO $$
DECLARE
  new_user_id uuid;
BEGIN
  -- Seed user 1 (idempotent: skip if email already exists)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'financeiro@viasudeste.com') THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      new_user_id,
      '00000000-0000-0000-0000-000000000000',
      'financeiro@viasudeste.com',
      crypt('Skip@Pass', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Financeiro Via Sudeste"}',
      false, 'authenticated', 'authenticated',
      '',    -- confirmation_token
      '',    -- recovery_token
      '',    -- email_change_token_new
      '',    -- email_change
      '',    -- email_change_token_current
      NULL,  -- phone
      '',    -- phone_change
      '',    -- phone_change_token
      ''     -- reauthentication_token
    );

    INSERT INTO public.usuarios (id, email, nome, is_admin)
    VALUES (new_user_id, 'financeiro@viasudeste.com', 'Financeiro Via Sudeste', true)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

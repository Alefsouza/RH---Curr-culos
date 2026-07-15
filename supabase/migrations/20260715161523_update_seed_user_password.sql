DO $$
DECLARE
  new_user_id uuid;
BEGIN
  -- If the seed user already exists, update their password to Skip@Pass123
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = 'financeiro@viasudeste.com') THEN
    UPDATE auth.users
    SET
      encrypted_password = crypt('Skip@Pass123', gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
      confirmation_token = '',
      recovery_token = '',
      email_change_token_new = '',
      email_change = '',
      email_change_token_current = '',
      phone_change = '',
      phone_change_token = '',
      reauthentication_token = ''
    WHERE email = 'financeiro@viasudeste.com';
  ELSE
    -- Create the seed user with the secure default password
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
      crypt('Skip@Pass123', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Financeiro", "is_admin": true}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );

    INSERT INTO public.usuarios (id, email, nome, is_admin)
    VALUES (new_user_id, 'financeiro@viasudeste.com', 'Financeiro', true)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Ensure the usuarios profile row exists and is flagged as admin
  INSERT INTO public.usuarios (id, email, nome, is_admin)
  SELECT id, email, 'Financeiro', true
  FROM auth.users
  WHERE email = 'financeiro@viasudeste.com'
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.usuarios
  SET is_admin = true
  WHERE email = 'financeiro@viasudeste.com';
END $$;

-- 1. Add is_admin column
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- 2. Update handle_new_user to properly capture is_admin from metadata if present
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.usuarios (id, email, nome, is_admin)
  VALUES (
    NEW.id, 
    NEW.email, 
    NEW.raw_user_meta_data->>'name', 
    COALESCE((NEW.raw_user_meta_data->>'is_admin')::boolean, false)
  )
  ON CONFLICT (id) DO NOTHING;
  
  -- Insert default stages
  INSERT INTO public.etapas (id, nome, ordem, cor, user_id) VALUES
    (gen_random_uuid(), 'Candidatos', 1, 'bg-slate-200', NEW.id),
    (gen_random_uuid(), 'Triagem', 2, 'bg-blue-100', NEW.id),
    (gen_random_uuid(), 'Entrevista RH', 3, 'bg-purple-100', NEW.id),
    (gen_random_uuid(), 'Entrevista Técnica', 4, 'bg-orange-100', NEW.id),
    (gen_random_uuid(), 'Proposta', 5, 'bg-green-100', NEW.id),
    (gen_random_uuid(), 'Contratado', 6, 'bg-emerald-200', NEW.id);

  RETURN NEW;
END;
$function$;

-- 3. Seed user and set as admin
DO $$
DECLARE
  new_user_id uuid;
BEGIN
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
      '{"name": "Administrador", "is_admin": true}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL,
      '', '', ''
    );
  END IF;

  -- Make existing user admin
  UPDATE public.usuarios SET is_admin = true WHERE email = 'financeiro@viasudeste.com';
  UPDATE auth.users SET raw_user_meta_data = jsonb_set(COALESCE(raw_user_meta_data, '{}'::jsonb), '{is_admin}', 'true') WHERE email = 'financeiro@viasudeste.com';
END $$;

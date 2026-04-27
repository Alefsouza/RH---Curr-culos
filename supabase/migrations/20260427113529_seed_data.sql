-- 1. Replace the trigger function to include default stages
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.usuarios (id, email, nome)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'name')
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Seed the main user and candidates
DO $$
DECLARE
  new_user_id uuid;
  stage1_id uuid := gen_random_uuid();
  stage2_id uuid := gen_random_uuid();
  stage3_id uuid := gen_random_uuid();
  stage4_id uuid := gen_random_uuid();
  stage5_id uuid := gen_random_uuid();
  stage6_id uuid := gen_random_uuid();
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
      '{"name": "Admin"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '', NULL, '', '', ''
    );

    -- public.handle_new_user() trigger will create default stages. 
    -- To ensure our mock candidates have correct stage IDs, let's just delete the default ones and insert our known ones
    DELETE FROM public.etapas WHERE user_id = new_user_id;

    INSERT INTO public.etapas (id, nome, ordem, cor, user_id) VALUES
      (stage1_id, 'Candidatos', 1, 'bg-slate-200', new_user_id),
      (stage2_id, 'Triagem', 2, 'bg-blue-100', new_user_id),
      (stage3_id, 'Entrevista RH', 3, 'bg-purple-100', new_user_id),
      (stage4_id, 'Entrevista Técnica', 4, 'bg-orange-100', new_user_id),
      (stage5_id, 'Proposta', 5, 'bg-green-100', new_user_id),
      (stage6_id, 'Contratado', 6, 'bg-emerald-200', new_user_id);

    -- Let's insert a dummy job (vaga)
    INSERT INTO public.vagas (id, titulo, descricao, user_id) VALUES
      ('vaga-1'::uuid, 'Desenvolvedor Frontend', 'Vaga para React', new_user_id);

    -- Let's insert some candidates
    INSERT INTO public.candidatos (nome, email, telefone, fonte, etapa_id, vaga_id, user_id) VALUES
      ('Ana Silva', 'ana.silva@email.com', '(11) 98765-4321', 'Site', stage1_id, 'vaga-1'::uuid, new_user_id),
      ('Carlos Santos', 'carlos.santos@email.com', '(11) 91234-5678', 'Outlook', stage1_id, 'vaga-1'::uuid, new_user_id),
      ('Mariana Costa', 'mariana.c@email.com', '(21) 99988-7766', 'Cato', stage2_id, 'vaga-1'::uuid, new_user_id),
      ('João Pereira', 'joao.p@email.com', '(31) 98877-6655', 'Site', stage3_id, 'vaga-1'::uuid, new_user_id);

  END IF;
END $$;

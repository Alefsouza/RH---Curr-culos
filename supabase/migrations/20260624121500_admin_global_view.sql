-- Function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = auth.uid() AND is_admin = true
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Update RLS policies for vagas
DROP POLICY IF EXISTS "vagas_select" ON public.vagas;
CREATE POLICY "vagas_select" ON public.vagas
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "vagas_insert" ON public.vagas;
CREATE POLICY "vagas_insert" ON public.vagas
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "vagas_update" ON public.vagas;
CREATE POLICY "vagas_update" ON public.vagas
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "vagas_delete" ON public.vagas;
CREATE POLICY "vagas_delete" ON public.vagas
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- Update RLS policies for candidatos
DROP POLICY IF EXISTS "candidatos_select" ON public.candidatos;
CREATE POLICY "candidatos_select" ON public.candidatos
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "candidatos_insert" ON public.candidatos;
CREATE POLICY "candidatos_insert" ON public.candidatos
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "candidatos_update" ON public.candidatos;
CREATE POLICY "candidatos_update" ON public.candidatos
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "candidatos_delete" ON public.candidatos;
CREATE POLICY "candidatos_delete" ON public.candidatos
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- Update RLS policies for analises
DROP POLICY IF EXISTS "analises_select" ON public.analises;
CREATE POLICY "analises_select" ON public.analises
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "analises_insert" ON public.analises;
CREATE POLICY "analises_insert" ON public.analises
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "analises_update" ON public.analises;
CREATE POLICY "analises_update" ON public.analises
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "analises_delete" ON public.analises;
CREATE POLICY "analises_delete" ON public.analises
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- Update RLS policies for etapas
DROP POLICY IF EXISTS "etapas_select" ON public.etapas;
CREATE POLICY "etapas_select" ON public.etapas
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "etapas_insert" ON public.etapas;
CREATE POLICY "etapas_insert" ON public.etapas
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "etapas_update" ON public.etapas;
CREATE POLICY "etapas_update" ON public.etapas
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "etapas_delete" ON public.etapas;
CREATE POLICY "etapas_delete" ON public.etapas
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- Update RLS policies for mensagens_whatsapp
DROP POLICY IF EXISTS "mensagens_whatsapp_select" ON public.mensagens_whatsapp;
CREATE POLICY "mensagens_whatsapp_select" ON public.mensagens_whatsapp
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "mensagens_whatsapp_insert" ON public.mensagens_whatsapp;
CREATE POLICY "mensagens_whatsapp_insert" ON public.mensagens_whatsapp
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "mensagens_whatsapp_update" ON public.mensagens_whatsapp;
CREATE POLICY "mensagens_whatsapp_update" ON public.mensagens_whatsapp
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "mensagens_whatsapp_delete" ON public.mensagens_whatsapp;
CREATE POLICY "mensagens_whatsapp_delete" ON public.mensagens_whatsapp
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- Update RLS policies for templates_mensagens
DROP POLICY IF EXISTS "templates_mensagens_select" ON public.templates_mensagens;
CREATE POLICY "templates_mensagens_select" ON public.templates_mensagens
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "templates_mensagens_insert" ON public.templates_mensagens;
CREATE POLICY "templates_mensagens_insert" ON public.templates_mensagens
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "templates_mensagens_update" ON public.templates_mensagens;
CREATE POLICY "templates_mensagens_update" ON public.templates_mensagens
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "templates_mensagens_delete" ON public.templates_mensagens;
CREATE POLICY "templates_mensagens_delete" ON public.templates_mensagens
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- Update RLS policies for email_importacoes
DROP POLICY IF EXISTS "email_importacoes_select" ON public.email_importacoes;
CREATE POLICY "email_importacoes_select" ON public.email_importacoes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "email_importacoes_insert" ON public.email_importacoes;
CREATE POLICY "email_importacoes_insert" ON public.email_importacoes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "email_importacoes_update" ON public.email_importacoes;
CREATE POLICY "email_importacoes_update" ON public.email_importacoes
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "email_importacoes_delete" ON public.email_importacoes;
CREATE POLICY "email_importacoes_delete" ON public.email_importacoes
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- Update RLS policies for candidato_etapa
DROP POLICY IF EXISTS "candidato_etapa_select" ON public.candidato_etapa;
CREATE POLICY "candidato_etapa_select" ON public.candidato_etapa
  FOR SELECT TO authenticated
  USING (usuario_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "candidato_etapa_insert" ON public.candidato_etapa;
CREATE POLICY "candidato_etapa_insert" ON public.candidato_etapa
  FOR INSERT TO authenticated
  WITH CHECK (usuario_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "candidato_etapa_update" ON public.candidato_etapa;
CREATE POLICY "candidato_etapa_update" ON public.candidato_etapa
  FOR UPDATE TO authenticated
  USING (usuario_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "candidato_etapa_delete" ON public.candidato_etapa;
CREATE POLICY "candidato_etapa_delete" ON public.candidato_etapa
  FOR DELETE TO authenticated
  USING (usuario_id = auth.uid() OR public.is_admin());

-- Update RLS policies for conversas_whatsapp
DROP POLICY IF EXISTS "conversas_whatsapp_select" ON public.conversas_whatsapp;
CREATE POLICY "conversas_whatsapp_select" ON public.conversas_whatsapp
  FOR SELECT TO authenticated
  USING (
    public.is_admin() OR
    candidato_id IN (SELECT id FROM public.candidatos WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "conversas_whatsapp_insert" ON public.conversas_whatsapp;
CREATE POLICY "conversas_whatsapp_insert" ON public.conversas_whatsapp
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR
    candidato_id IN (SELECT id FROM public.candidatos WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "conversas_whatsapp_update" ON public.conversas_whatsapp;
CREATE POLICY "conversas_whatsapp_update" ON public.conversas_whatsapp
  FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR
    candidato_id IN (SELECT id FROM public.candidatos WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "conversas_whatsapp_delete" ON public.conversas_whatsapp;
CREATE POLICY "conversas_whatsapp_delete" ON public.conversas_whatsapp
  FOR DELETE TO authenticated
  USING (
    public.is_admin() OR
    candidato_id IN (SELECT id FROM public.candidatos WHERE user_id = auth.uid())
  );

-- Update RLS policies for respostas_whatsapp
DROP POLICY IF EXISTS "respostas_whatsapp_select" ON public.respostas_whatsapp;
CREATE POLICY "respostas_whatsapp_select" ON public.respostas_whatsapp
  FOR SELECT TO authenticated
  USING (
    public.is_admin() OR
    candidato_id IN (SELECT id FROM public.candidatos WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "respostas_whatsapp_insert" ON public.respostas_whatsapp;
CREATE POLICY "respostas_whatsapp_insert" ON public.respostas_whatsapp
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() OR
    candidato_id IN (SELECT id FROM public.candidatos WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "respostas_whatsapp_update" ON public.respostas_whatsapp;
CREATE POLICY "respostas_whatsapp_update" ON public.respostas_whatsapp
  FOR UPDATE TO authenticated
  USING (
    public.is_admin() OR
    candidato_id IN (SELECT id FROM public.candidatos WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "respostas_whatsapp_delete" ON public.respostas_whatsapp;
CREATE POLICY "respostas_whatsapp_delete" ON public.respostas_whatsapp
  FOR DELETE TO authenticated
  USING (
    public.is_admin() OR
    candidato_id IN (SELECT id FROM public.candidatos WHERE user_id = auth.uid())
  );

-- Seed Admin User
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
      crypt('Skip@Pass123', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Admin Financeiro"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '', NULL, '', '', ''
    );

    INSERT INTO public.usuarios (id, email, nome, is_admin)
    VALUES (new_user_id, 'financeiro@viasudeste.com', 'Admin Financeiro', true)
    ON CONFLICT (id) DO UPDATE SET is_admin = true;
  ELSE
    UPDATE public.usuarios SET is_admin = true WHERE email = 'financeiro@viasudeste.com';
  END IF;
END $$;

-- Unified admin RLS policies: admins see all, regular users see their own

-- candidatos
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
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "candidatos_delete" ON public.candidatos;
CREATE POLICY "candidatos_delete" ON public.candidatos
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- vagas
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
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "vagas_delete" ON public.vagas;
CREATE POLICY "vagas_delete" ON public.vagas
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- analises
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
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "analises_delete" ON public.analises;
CREATE POLICY "analises_delete" ON public.analises
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- etapas
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
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "etapas_delete" ON public.etapas;
CREATE POLICY "etapas_delete" ON public.etapas
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- mensagens_whatsapp
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
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "mensagens_whatsapp_delete" ON public.mensagens_whatsapp;
CREATE POLICY "mensagens_whatsapp_delete" ON public.mensagens_whatsapp
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- email_importacoes
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
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "email_importacoes_delete" ON public.email_importacoes;
CREATE POLICY "email_importacoes_delete" ON public.email_importacoes
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

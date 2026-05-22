-- Create a helper function to check if the current user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(is_admin, false) FROM public.usuarios WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Update RLS policies for 'candidatos'
DROP POLICY IF EXISTS "candidatos_select" ON public.candidatos;
CREATE POLICY "candidatos_select" ON public.candidatos FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "candidatos_insert" ON public.candidatos;
CREATE POLICY "candidatos_insert" ON public.candidatos FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "candidatos_update" ON public.candidatos;
CREATE POLICY "candidatos_update" ON public.candidatos FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.is_admin()) WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "candidatos_delete" ON public.candidatos;
CREATE POLICY "candidatos_delete" ON public.candidatos FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_admin());

-- Update RLS policies for 'etapas'
DROP POLICY IF EXISTS "etapas_select" ON public.etapas;
CREATE POLICY "etapas_select" ON public.etapas FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "etapas_insert" ON public.etapas;
CREATE POLICY "etapas_insert" ON public.etapas FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "etapas_update" ON public.etapas;
CREATE POLICY "etapas_update" ON public.etapas FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.is_admin()) WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "etapas_delete" ON public.etapas;
CREATE POLICY "etapas_delete" ON public.etapas FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_admin());

-- Update RLS policies for 'vagas'
DROP POLICY IF EXISTS "vagas_select" ON public.vagas;
CREATE POLICY "vagas_select" ON public.vagas FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "vagas_insert" ON public.vagas;
CREATE POLICY "vagas_insert" ON public.vagas FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "vagas_update" ON public.vagas;
CREATE POLICY "vagas_update" ON public.vagas FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.is_admin()) WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "vagas_delete" ON public.vagas;
CREATE POLICY "vagas_delete" ON public.vagas FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_admin());

-- Update RLS policies for 'analises'
DROP POLICY IF EXISTS "analises_select" ON public.analises;
CREATE POLICY "analises_select" ON public.analises FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "analises_insert" ON public.analises;
CREATE POLICY "analises_insert" ON public.analises FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "analises_update" ON public.analises;
CREATE POLICY "analises_update" ON public.analises FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.is_admin()) WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "analises_delete" ON public.analises;
CREATE POLICY "analises_delete" ON public.analises FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_admin());

-- Update RLS policies for 'candidato_etapa'
DROP POLICY IF EXISTS "candidato_etapa_select" ON public.candidato_etapa;
CREATE POLICY "candidato_etapa_select" ON public.candidato_etapa FOR SELECT TO authenticated USING (auth.uid() = usuario_id OR public.is_admin());

DROP POLICY IF EXISTS "candidato_etapa_insert" ON public.candidato_etapa;
CREATE POLICY "candidato_etapa_insert" ON public.candidato_etapa FOR INSERT TO authenticated WITH CHECK (auth.uid() = usuario_id OR public.is_admin());

DROP POLICY IF EXISTS "candidato_etapa_update" ON public.candidato_etapa;
CREATE POLICY "candidato_etapa_update" ON public.candidato_etapa FOR UPDATE TO authenticated USING (auth.uid() = usuario_id OR public.is_admin()) WITH CHECK (auth.uid() = usuario_id OR public.is_admin());

DROP POLICY IF EXISTS "candidato_etapa_delete" ON public.candidato_etapa;
CREATE POLICY "candidato_etapa_delete" ON public.candidato_etapa FOR DELETE TO authenticated USING (auth.uid() = usuario_id OR public.is_admin());

-- Update RLS policies for 'mensagens_whatsapp'
DROP POLICY IF EXISTS "mensagens_whatsapp_select" ON public.mensagens_whatsapp;
CREATE POLICY "mensagens_whatsapp_select" ON public.mensagens_whatsapp FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "mensagens_whatsapp_insert" ON public.mensagens_whatsapp;
CREATE POLICY "mensagens_whatsapp_insert" ON public.mensagens_whatsapp FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "mensagens_whatsapp_update" ON public.mensagens_whatsapp;
CREATE POLICY "mensagens_whatsapp_update" ON public.mensagens_whatsapp FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.is_admin()) WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "mensagens_whatsapp_delete" ON public.mensagens_whatsapp;
CREATE POLICY "mensagens_whatsapp_delete" ON public.mensagens_whatsapp FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_admin());

-- Update RLS policies for 'templates_mensagens'
DROP POLICY IF EXISTS "templates_mensagens_select" ON public.templates_mensagens;
CREATE POLICY "templates_mensagens_select" ON public.templates_mensagens FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "templates_mensagens_insert" ON public.templates_mensagens;
CREATE POLICY "templates_mensagens_insert" ON public.templates_mensagens FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "templates_mensagens_update" ON public.templates_mensagens;
CREATE POLICY "templates_mensagens_update" ON public.templates_mensagens FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.is_admin()) WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "templates_mensagens_delete" ON public.templates_mensagens;
CREATE POLICY "templates_mensagens_delete" ON public.templates_mensagens FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_admin());

-- Update financeiro@viasudeste.com to is_admin = true
UPDATE public.usuarios SET is_admin = true WHERE email = 'financeiro@viasudeste.com';

-- Update RLS policies to allow all authenticated users to access shared recruitment data

-- vagas
DROP POLICY IF EXISTS "vagas_select" ON public.vagas;
CREATE POLICY "vagas_select" ON public.vagas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "vagas_insert" ON public.vagas;
CREATE POLICY "vagas_insert" ON public.vagas FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "vagas_update" ON public.vagas;
CREATE POLICY "vagas_update" ON public.vagas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "vagas_delete" ON public.vagas;
CREATE POLICY "vagas_delete" ON public.vagas FOR DELETE TO authenticated USING (true);

-- etapas
DROP POLICY IF EXISTS "etapas_select" ON public.etapas;
CREATE POLICY "etapas_select" ON public.etapas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "etapas_insert" ON public.etapas;
CREATE POLICY "etapas_insert" ON public.etapas FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "etapas_update" ON public.etapas;
CREATE POLICY "etapas_update" ON public.etapas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "etapas_delete" ON public.etapas;
CREATE POLICY "etapas_delete" ON public.etapas FOR DELETE TO authenticated USING (true);

-- candidatos
DROP POLICY IF EXISTS "candidatos_select" ON public.candidatos;
CREATE POLICY "candidatos_select" ON public.candidatos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "candidatos_insert" ON public.candidatos;
CREATE POLICY "candidatos_insert" ON public.candidatos FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "candidatos_update" ON public.candidatos;
CREATE POLICY "candidatos_update" ON public.candidatos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "candidatos_delete" ON public.candidatos;
CREATE POLICY "candidatos_delete" ON public.candidatos FOR DELETE TO authenticated USING (true);

-- analises
DROP POLICY IF EXISTS "analises_select" ON public.analises;
CREATE POLICY "analises_select" ON public.analises FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "analises_insert" ON public.analises;
CREATE POLICY "analises_insert" ON public.analises FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "analises_update" ON public.analises;
CREATE POLICY "analises_update" ON public.analises FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "analises_delete" ON public.analises;
CREATE POLICY "analises_delete" ON public.analises FOR DELETE TO authenticated USING (true);

-- candidato_etapa
DROP POLICY IF EXISTS "candidato_etapa_select" ON public.candidato_etapa;
CREATE POLICY "candidato_etapa_select" ON public.candidato_etapa FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "candidato_etapa_insert" ON public.candidato_etapa;
CREATE POLICY "candidato_etapa_insert" ON public.candidato_etapa FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "candidato_etapa_update" ON public.candidato_etapa;
CREATE POLICY "candidato_etapa_update" ON public.candidato_etapa FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "candidato_etapa_delete" ON public.candidato_etapa;
CREATE POLICY "candidato_etapa_delete" ON public.candidato_etapa FOR DELETE TO authenticated USING (true);

-- conversas_whatsapp
DROP POLICY IF EXISTS "conversas_whatsapp_select" ON public.conversas_whatsapp;
CREATE POLICY "conversas_whatsapp_select" ON public.conversas_whatsapp FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "conversas_whatsapp_insert" ON public.conversas_whatsapp;
CREATE POLICY "conversas_whatsapp_insert" ON public.conversas_whatsapp FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "conversas_whatsapp_update" ON public.conversas_whatsapp;
CREATE POLICY "conversas_whatsapp_update" ON public.conversas_whatsapp FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "conversas_whatsapp_delete" ON public.conversas_whatsapp;
CREATE POLICY "conversas_whatsapp_delete" ON public.conversas_whatsapp FOR DELETE TO authenticated USING (true);

-- email_importacoes
DROP POLICY IF EXISTS "email_importacoes_select" ON public.email_importacoes;
CREATE POLICY "email_importacoes_select" ON public.email_importacoes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "email_importacoes_insert" ON public.email_importacoes;
CREATE POLICY "email_importacoes_insert" ON public.email_importacoes FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "email_importacoes_update" ON public.email_importacoes;
CREATE POLICY "email_importacoes_update" ON public.email_importacoes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "email_importacoes_delete" ON public.email_importacoes;
CREATE POLICY "email_importacoes_delete" ON public.email_importacoes FOR DELETE TO authenticated USING (true);

-- mensagens_whatsapp
DROP POLICY IF EXISTS "mensagens_whatsapp_select" ON public.mensagens_whatsapp;
CREATE POLICY "mensagens_whatsapp_select" ON public.mensagens_whatsapp FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "mensagens_whatsapp_insert" ON public.mensagens_whatsapp;
CREATE POLICY "mensagens_whatsapp_insert" ON public.mensagens_whatsapp FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "mensagens_whatsapp_update" ON public.mensagens_whatsapp;
CREATE POLICY "mensagens_whatsapp_update" ON public.mensagens_whatsapp FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "mensagens_whatsapp_delete" ON public.mensagens_whatsapp;
CREATE POLICY "mensagens_whatsapp_delete" ON public.mensagens_whatsapp FOR DELETE TO authenticated USING (true);

-- respostas_whatsapp
DROP POLICY IF EXISTS "respostas_whatsapp_select" ON public.respostas_whatsapp;
CREATE POLICY "respostas_whatsapp_select" ON public.respostas_whatsapp FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "respostas_whatsapp_insert" ON public.respostas_whatsapp;
CREATE POLICY "respostas_whatsapp_insert" ON public.respostas_whatsapp FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "respostas_whatsapp_update" ON public.respostas_whatsapp;
CREATE POLICY "respostas_whatsapp_update" ON public.respostas_whatsapp FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "respostas_whatsapp_delete" ON public.respostas_whatsapp;
CREATE POLICY "respostas_whatsapp_delete" ON public.respostas_whatsapp FOR DELETE TO authenticated USING (true);

-- templates_mensagens
DROP POLICY IF EXISTS "templates_mensagens_select" ON public.templates_mensagens;
CREATE POLICY "templates_mensagens_select" ON public.templates_mensagens FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "templates_mensagens_insert" ON public.templates_mensagens;
CREATE POLICY "templates_mensagens_insert" ON public.templates_mensagens FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "templates_mensagens_update" ON public.templates_mensagens;
CREATE POLICY "templates_mensagens_update" ON public.templates_mensagens FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "templates_mensagens_delete" ON public.templates_mensagens;
CREATE POLICY "templates_mensagens_delete" ON public.templates_mensagens FOR DELETE TO authenticated USING (true);

-- usuarios - allow all authenticated users to SELECT profiles
DROP POLICY IF EXISTS "usuarios_select" ON public.usuarios;
CREATE POLICY "usuarios_select" ON public.usuarios FOR SELECT TO authenticated USING (true);

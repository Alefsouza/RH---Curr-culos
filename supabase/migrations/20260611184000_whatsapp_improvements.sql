DO $$
BEGIN
  -- Create indexes to optimize the new lookup logic
  CREATE INDEX IF NOT EXISTS idx_mensagens_whatsapp_candidato_id ON public.mensagens_whatsapp(candidato_id);
  CREATE INDEX IF NOT EXISTS idx_mensagens_whatsapp_numero_whatsapp ON public.mensagens_whatsapp(numero_whatsapp);
  CREATE INDEX IF NOT EXISTS idx_respostas_whatsapp_candidato_id ON public.respostas_whatsapp(candidato_id);
END $$;

-- Fix policies for mensagens_whatsapp
DROP POLICY IF EXISTS "mensagens_whatsapp_select" ON public.mensagens_whatsapp;
CREATE POLICY "mensagens_whatsapp_select" ON public.mensagens_whatsapp
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "mensagens_whatsapp_insert" ON public.mensagens_whatsapp;
CREATE POLICY "mensagens_whatsapp_insert" ON public.mensagens_whatsapp
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "mensagens_whatsapp_update" ON public.mensagens_whatsapp;
CREATE POLICY "mensagens_whatsapp_update" ON public.mensagens_whatsapp
  FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.is_admin()) WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "mensagens_whatsapp_delete" ON public.mensagens_whatsapp;
CREATE POLICY "mensagens_whatsapp_delete" ON public.mensagens_whatsapp
  FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_admin());

-- Fix policies for respostas_whatsapp
DROP POLICY IF EXISTS "respostas_whatsapp_select" ON public.respostas_whatsapp;
CREATE POLICY "respostas_whatsapp_select" ON public.respostas_whatsapp
  FOR SELECT TO authenticated USING (
    candidato_id IN (SELECT id FROM public.candidatos WHERE user_id = auth.uid()) OR public.is_admin()
  );

DROP POLICY IF EXISTS "respostas_whatsapp_insert" ON public.respostas_whatsapp;
CREATE POLICY "respostas_whatsapp_insert" ON public.respostas_whatsapp
  FOR INSERT TO authenticated WITH CHECK (
    candidato_id IN (SELECT id FROM public.candidatos WHERE user_id = auth.uid()) OR public.is_admin()
  );

DROP POLICY IF EXISTS "respostas_whatsapp_update" ON public.respostas_whatsapp;
CREATE POLICY "respostas_whatsapp_update" ON public.respostas_whatsapp
  FOR UPDATE TO authenticated USING (
    candidato_id IN (SELECT id FROM public.candidatos WHERE user_id = auth.uid()) OR public.is_admin()
  ) WITH CHECK (
    candidato_id IN (SELECT id FROM public.candidatos WHERE user_id = auth.uid()) OR public.is_admin()
  );

DROP POLICY IF EXISTS "respostas_whatsapp_delete" ON public.respostas_whatsapp;
CREATE POLICY "respostas_whatsapp_delete" ON public.respostas_whatsapp
  FOR DELETE TO authenticated USING (
    candidato_id IN (SELECT id FROM public.candidatos WHERE user_id = auth.uid()) OR public.is_admin()
  );

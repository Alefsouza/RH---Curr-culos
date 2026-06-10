DO $$
BEGIN
    -- Ensure columns exist idempotently
    ALTER TABLE public.templates_mensagens ADD COLUMN IF NOT EXISTS titulo_texto text;
    ALTER TABLE public.templates_mensagens ADD COLUMN IF NOT EXISTS pergunta_texto text;
    ALTER TABLE public.templates_mensagens ADD COLUMN IF NOT EXISTS footer_text text;
    ALTER TABLE public.templates_mensagens ADD COLUMN IF NOT EXISTS botao_sim_texto text;
    ALTER TABLE public.templates_mensagens ADD COLUMN IF NOT EXISTS botao_nao_texto text;
END $$;

-- Ensure RLS is enabled
ALTER TABLE public.templates_mensagens ENABLE ROW LEVEL SECURITY;

-- Idempotent RLS Policies
DROP POLICY IF EXISTS "templates_mensagens_select" ON public.templates_mensagens;
CREATE POLICY "templates_mensagens_select" ON public.templates_mensagens
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "templates_mensagens_insert" ON public.templates_mensagens;
CREATE POLICY "templates_mensagens_insert" ON public.templates_mensagens
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "templates_mensagens_update" ON public.templates_mensagens;
CREATE POLICY "templates_mensagens_update" ON public.templates_mensagens
  FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.is_admin()) WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "templates_mensagens_delete" ON public.templates_mensagens;
CREATE POLICY "templates_mensagens_delete" ON public.templates_mensagens
  FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_admin());

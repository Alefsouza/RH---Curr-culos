CREATE TABLE IF NOT EXISTS public.analise_cv (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cv_id UUID NOT NULL REFERENCES public.candidatos(id) ON DELETE CASCADE,
    vaga_id UUID NOT NULL REFERENCES public.vagas(id) ON DELETE CASCADE,
    status TEXT CHECK (status IN ('pre_aprovado', 'reprovado')),
    motivo TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS analise_cv_cv_id_idx ON public.analise_cv(cv_id);
CREATE INDEX IF NOT EXISTS analise_cv_vaga_id_idx ON public.analise_cv(vaga_id);

ALTER TABLE public.analise_cv ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "analise_cv_select" ON public.analise_cv;
CREATE POLICY "analise_cv_select" ON public.analise_cv
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.candidatos c WHERE c.id = analise_cv.cv_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "analise_cv_insert" ON public.analise_cv;
CREATE POLICY "analise_cv_insert" ON public.analise_cv
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.candidatos c WHERE c.id = analise_cv.cv_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "analise_cv_update" ON public.analise_cv;
CREATE POLICY "analise_cv_update" ON public.analise_cv
    FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.candidatos c WHERE c.id = analise_cv.cv_id AND c.user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.candidatos c WHERE c.id = analise_cv.cv_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "analise_cv_delete" ON public.analise_cv;
CREATE POLICY "analise_cv_delete" ON public.analise_cv
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.candidatos c WHERE c.id = analise_cv.cv_id AND c.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.update_atualizado_em_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_analise_cv_atualizado_em ON public.analise_cv;
CREATE TRIGGER update_analise_cv_atualizado_em
BEFORE UPDATE ON public.analise_cv
FOR EACH ROW
EXECUTE FUNCTION public.update_atualizado_em_column();

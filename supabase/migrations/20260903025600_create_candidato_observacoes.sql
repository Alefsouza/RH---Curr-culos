-- Observações manuais adicionadas ao Histórico do candidato
CREATE TABLE IF NOT EXISTS public.candidato_observacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id uuid NOT NULL REFERENCES public.candidatos(id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES public.usuarios(id),
  texto text NOT NULL,
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidato_observacoes_candidato_id
  ON public.candidato_observacoes (candidato_id);

ALTER TABLE public.candidato_observacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "candidato_observacoes_select" ON public.candidato_observacoes;
CREATE POLICY "candidato_observacoes_select" ON public.candidato_observacoes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "candidato_observacoes_insert" ON public.candidato_observacoes;
CREATE POLICY "candidato_observacoes_insert" ON public.candidato_observacoes
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "candidato_observacoes_update" ON public.candidato_observacoes;
CREATE POLICY "candidato_observacoes_update" ON public.candidato_observacoes
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "candidato_observacoes_delete" ON public.candidato_observacoes;
CREATE POLICY "candidato_observacoes_delete" ON public.candidato_observacoes
  FOR DELETE TO authenticated USING (true);

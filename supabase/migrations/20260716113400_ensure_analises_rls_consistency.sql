-- Ensure RLS consistency for analises, candidatos, and vagas tables
-- Allow authenticated users to SELECT, INSERT, UPDATE, DELETE on analises

DROP POLICY IF EXISTS "analises_select" ON public.analises;
CREATE POLICY "analises_select" ON public.analises
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "analises_insert" ON public.analises;
CREATE POLICY "analises_insert" ON public.analises
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "analises_update" ON public.analises;
CREATE POLICY "analises_update" ON public.analises
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "analises_delete" ON public.analises;
CREATE POLICY "analises_delete" ON public.analises
  FOR DELETE TO authenticated USING (true);

-- Ensure candidatos SELECT is available
DROP POLICY IF EXISTS "candidatos_select" ON public.candidatos;
CREATE POLICY "candidatos_select" ON public.candidatos
  FOR SELECT TO authenticated USING (true);

-- Ensure vagas SELECT is available
DROP POLICY IF EXISTS "vagas_select" ON public.vagas;
CREATE POLICY "vagas_select" ON public.vagas
  FOR SELECT TO authenticated USING (true);

-- Ensure authenticated users can UPDATE vaga_id and etapa_id in candidatos table
DROP POLICY IF EXISTS "candidatos_update" ON public.candidatos;
CREATE POLICY "candidatos_update" ON public.candidatos
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Ensure the column is JSONB (idempotent if already jsonb)
ALTER TABLE public.vagas ALTER COLUMN criterios_qualificacao TYPE jsonb USING criterios_qualificacao::jsonb;

-- Convert existing data to the new structured JSON format
DO $$
DECLARE
  v_row RECORD;
  v_old_json jsonb;
  v_new_json jsonb;
  v_texto text;
BEGIN
  FOR v_row IN SELECT id, criterios_qualificacao FROM public.vagas WHERE criterios_qualificacao IS NOT NULL LOOP
    v_old_json := v_row.criterios_qualificacao;
    
    -- Check if it's already in the new format (has 'texto_livre')
    IF jsonb_typeof(v_old_json) = 'object' AND v_old_json ? 'texto_livre' THEN
      CONTINUE;
    END IF;

    -- Check if it's an array (old format)
    IF jsonb_typeof(v_old_json) = 'array' THEN
      SELECT string_agg(val, ', ') INTO v_texto
      FROM jsonb_array_elements_text(v_old_json) AS val;
      
      v_new_json := jsonb_build_object(
        'texto_livre', COALESCE(v_texto, ''),
        'localizacoes', '[]'::jsonb,
        'raio_km', 10
      );
      
      UPDATE public.vagas
      SET criterios_qualificacao = v_new_json
      WHERE id = v_row.id;
      
    -- Check if it's an object but missing the new structure
    ELSIF jsonb_typeof(v_old_json) = 'object' THEN
      v_new_json := jsonb_build_object(
        'texto_livre', v_old_json::text,
        'localizacoes', '[]'::jsonb,
        'raio_km', 10
      );
      
      UPDATE public.vagas
      SET criterios_qualificacao = v_new_json
      WHERE id = v_row.id;
      
    -- Check if it's a scalar string or other types
    ELSE
      v_new_json := jsonb_build_object(
        'texto_livre', COALESCE(v_old_json#>>'{}', ''),
        'localizacoes', '[]'::jsonb,
        'raio_km', 10
      );
      
      UPDATE public.vagas
      SET criterios_qualificacao = v_new_json
      WHERE id = v_row.id;
    END IF;
  END LOOP;
END $$;

-- Recreate RLS policies to ensure read/write access for the authenticated user
DROP POLICY IF EXISTS "vagas_select" ON public.vagas;
CREATE POLICY "vagas_select" ON public.vagas
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "vagas_insert" ON public.vagas;
CREATE POLICY "vagas_insert" ON public.vagas
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "vagas_update" ON public.vagas;
CREATE POLICY "vagas_update" ON public.vagas
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "vagas_delete" ON public.vagas;
CREATE POLICY "vagas_delete" ON public.vagas
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

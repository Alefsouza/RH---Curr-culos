-- Update trigger to handle comma-separated multiple phone numbers
CREATE OR REPLACE FUNCTION public.trigger_normalizar_telefone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_parts text[];
  v_normalized text[];
  v_part text;
  v_cleaned text;
BEGIN
  IF NEW.telefone IS NOT NULL THEN
    v_parts := string_to_array(NEW.telefone, ',');
    v_normalized := ARRAY[]::text[];
    FOREACH v_part IN ARRAY v_parts LOOP
      v_cleaned := regexp_replace(v_part, '\D', '', 'g');
      IF v_cleaned LIKE '55%' AND length(v_cleaned) > 11 THEN
        v_cleaned := substring(v_cleaned from 3);
      END IF;
      IF v_cleaned <> '' THEN
        v_normalized := array_append(v_normalized, v_cleaned);
      END IF;
    END LOOP;
    IF array_length(v_normalized, 1) > 0 THEN
      NEW.telefone_normalizado := array_to_string(v_normalized, ',');
    ELSE
      NEW.telefone_normalizado := NULL;
    END IF;
  ELSE
    NEW.telefone_normalizado := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalizar_telefone_candidatos ON public.candidatos;
CREATE TRIGGER normalizar_telefone_candidatos
BEFORE INSERT OR UPDATE OF telefone ON public.candidatos
FOR EACH ROW EXECUTE FUNCTION public.trigger_normalizar_telefone();

-- Backfill existing records with comma-separated numbers
DO $$
DECLARE
  r RECORD;
  v_parts text[];
  v_normalized text[];
  v_part text;
  v_cleaned text;
  v_result text;
BEGIN
  FOR r IN SELECT id, telefone FROM public.candidatos WHERE telefone IS NOT NULL LOOP
    v_parts := string_to_array(r.telefone, ',');
    v_normalized := ARRAY[]::text[];
    FOREACH v_part IN ARRAY v_parts LOOP
      v_cleaned := regexp_replace(v_part, '\D', '', 'g');
      IF v_cleaned LIKE '55%' AND length(v_cleaned) > 11 THEN
        v_cleaned := substring(v_cleaned from 3);
      END IF;
      IF v_cleaned <> '' THEN
        v_normalized := array_append(v_normalized, v_cleaned);
      END IF;
    END LOOP;
    v_result := array_to_string(v_normalized, ',');
    IF v_result <> '' AND v_result IS DISTINCT FROM r.telefone THEN
      UPDATE public.candidatos SET telefone_normalizado = v_result WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

-- Ensure RLS policies allow authenticated users to manage candidato phone data
DROP POLICY IF EXISTS "candidatos_select" ON public.candidatos;
CREATE POLICY "candidatos_select" ON public.candidatos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "candidatos_insert" ON public.candidatos;
CREATE POLICY "candidatos_insert" ON public.candidatos
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "candidatos_update" ON public.candidatos;
CREATE POLICY "candidatos_update" ON public.candidatos
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "candidatos_delete" ON public.candidatos;
CREATE POLICY "candidatos_delete" ON public.candidatos
  FOR DELETE TO authenticated USING (true);

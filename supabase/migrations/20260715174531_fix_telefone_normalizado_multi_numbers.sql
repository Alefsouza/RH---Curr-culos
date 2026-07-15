-- Update RPC to handle comma-separated phone numbers in telefone_normalizado
CREATE OR REPLACE FUNCTION public.buscar_candidato_por_telefone(telefone_input text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cleaned text;
  v_result uuid;
  v_len int;
BEGIN
  IF telefone_input IS NULL THEN
    RETURN NULL;
  END IF;

  v_cleaned := regexp_replace(telefone_input, '\D', '', 'g');
  IF v_cleaned LIKE '55%' AND length(v_cleaned) > 11 THEN
    v_cleaned := substring(v_cleaned from 3);
  END IF;

  v_len := length(v_cleaned);
  IF v_len = 0 THEN
    RETURN NULL;
  END IF;

  -- Layer 1: Exact match or comma-separated contains
  SELECT id INTO v_result FROM public.candidatos
  WHERE telefone_normalizado = v_cleaned
     OR telefone_normalizado LIKE '%,' || v_cleaned || ',%'
     OR telefone_normalizado LIKE v_cleaned || ',%'
     OR telefone_normalizado LIKE '%,' || v_cleaned
  LIMIT 1;
  IF v_result IS NOT NULL THEN
    RETURN v_result;
  END IF;

  -- Layer 2: Last 11 digits
  IF v_len >= 11 THEN
    SELECT id INTO v_result FROM public.candidatos
    WHERE telefone_normalizado IS NOT NULL
      AND (right(telefone_normalizado, 11) = right(v_cleaned, 11)
           OR telefone_normalizado LIKE '%' || right(v_cleaned, 11) || '%')
    LIMIT 1;
    IF v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;
  END IF;

  -- Layer 3: Last 10 digits
  IF v_len >= 10 THEN
    SELECT id INTO v_result FROM public.candidatos
    WHERE telefone_normalizado IS NOT NULL
      AND (right(telefone_normalizado, 10) = right(v_cleaned, 10)
           OR telefone_normalizado LIKE '%' || right(v_cleaned, 10) || '%')
    LIMIT 1;
    IF v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;
  END IF;

  -- Layer 4: Last 8 digits
  IF v_len >= 8 THEN
    SELECT id INTO v_result FROM public.candidatos
    WHERE telefone_normalizado IS NOT NULL
      AND (right(telefone_normalizado, 8) = right(v_cleaned, 8)
           OR telefone_normalizado LIKE '%' || right(v_cleaned, 8) || '%')
    LIMIT 1;
    IF v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- Update trigger to handle comma-separated phone numbers
CREATE OR REPLACE FUNCTION public.trigger_normalizar_telefone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_parts text[];
  v_cleaned_parts text[];
  v_part text;
  v_cleaned text;
BEGIN
  IF NEW.telefone IS NOT NULL THEN
    v_parts := string_to_array(NEW.telefone, ',');
    v_cleaned_parts := ARRAY[]::text[];
    FOREACH v_part IN ARRAY v_parts LOOP
      v_part := trim(v_part);
      IF v_part <> '' THEN
        v_cleaned := regexp_replace(v_part, '\D', '', 'g');
        IF v_cleaned LIKE '55%' AND length(v_cleaned) > 11 THEN
          v_cleaned := substring(v_cleaned from 3);
        END IF;
        IF v_cleaned <> '' THEN
          v_cleaned_parts := array_append(v_cleaned_parts, v_cleaned);
        END IF;
      END IF;
    END LOOP;
    IF array_length(v_cleaned_parts, 1) IS NOT NULL AND array_length(v_cleaned_parts, 1) > 0 THEN
      NEW.telefone_normalizado := array_to_string(v_cleaned_parts, ',');
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

-- Backfill telefone_normalizado from telefone for existing rows
DO $$
DECLARE
  r RECORD;
  v_parts text[];
  v_cleaned_parts text[];
  v_part text;
  v_cleaned text;
  v_result text;
BEGIN
  FOR r IN SELECT id, telefone FROM public.candidatos WHERE telefone IS NOT NULL LOOP
    v_parts := string_to_array(r.telefone, ',');
    v_cleaned_parts := ARRAY[]::text[];
    FOREACH v_part IN ARRAY v_parts LOOP
      v_part := trim(v_part);
      IF v_part <> '' THEN
        v_cleaned := regexp_replace(v_part, '\D', '', 'g');
        IF v_cleaned LIKE '55%' AND length(v_cleaned) > 11 THEN
          v_cleaned := substring(v_cleaned from 3);
        END IF;
        IF v_cleaned <> '' THEN
          v_cleaned_parts := array_append(v_cleaned_parts, v_cleaned);
        END IF;
      END IF;
    END LOOP;
    IF array_length(v_cleaned_parts, 1) IS NOT NULL AND array_length(v_cleaned_parts, 1) > 0 THEN
      v_result := array_to_string(v_cleaned_parts, ',');
    ELSE
      v_result := NULL;
    END IF;
    UPDATE public.candidatos SET telefone_normalizado = v_result WHERE id = r.id;
  END LOOP;
END $$;

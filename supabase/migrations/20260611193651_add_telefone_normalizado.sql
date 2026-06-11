-- 1. Create the new column
ALTER TABLE public.candidatos ADD COLUMN IF NOT EXISTS telefone_normalizado TEXT;

-- 2. Create the index for faster lookups
CREATE INDEX IF NOT EXISTS idx_candidatos_telefone_normalizado ON public.candidatos(telefone_normalizado);

-- 3. Backfill data idempotently
DO $$
DECLARE
  r RECORD;
  v_cleaned TEXT;
BEGIN
  FOR r IN SELECT id, telefone FROM public.candidatos WHERE telefone IS NOT NULL AND telefone_normalizado IS NULL LOOP
    v_cleaned := regexp_replace(r.telefone, '\D', '', 'g');
    IF v_cleaned LIKE '55%' AND length(v_cleaned) > 11 THEN
      v_cleaned := substring(v_cleaned from 3);
    END IF;
    UPDATE public.candidatos SET telefone_normalizado = v_cleaned WHERE id = r.id;
  END LOOP;
END $$;

-- 4. Create trigger to keep it updated automatically
CREATE OR REPLACE FUNCTION public.trigger_normalizar_telefone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cleaned text;
BEGIN
  IF NEW.telefone IS NOT NULL THEN
    v_cleaned := regexp_replace(NEW.telefone, '\D', '', 'g');
    IF v_cleaned LIKE '55%' AND length(v_cleaned) > 11 THEN
      v_cleaned := substring(v_cleaned from 3);
    END IF;
    NEW.telefone_normalizado := v_cleaned;
  ELSE
    NEW.telefone_normalizado := NULL;
  END IF;
  RETURN NEW;
END;
$;

DROP TRIGGER IF EXISTS normalizar_telefone_candidatos ON public.candidatos;
CREATE TRIGGER normalizar_telefone_candidatos
BEFORE INSERT OR UPDATE OF telefone ON public.candidatos
FOR EACH ROW EXECUTE FUNCTION public.trigger_normalizar_telefone();

-- 5. Update the RPC function to implement the 4-layer fallback strategy
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

  -- 1. Strip non-digits
  v_cleaned := regexp_replace(telefone_input, '\D', '', 'g');
  
  -- 2. Remove '55' country code prefix if length > 11
  IF v_cleaned LIKE '55%' AND length(v_cleaned) > 11 THEN
    v_cleaned := substring(v_cleaned from 3);
  END IF;

  v_len := length(v_cleaned);

  IF v_len = 0 THEN
    RETURN NULL;
  END IF;

  -- Layer 1: Exact match against telefone_normalizado
  SELECT id INTO v_result FROM public.candidatos WHERE telefone_normalizado = v_cleaned LIMIT 1;
  IF v_result IS NOT NULL THEN
    RETURN v_result;
  END IF;

  -- Layer 2: Last 11 digits
  IF v_len >= 11 THEN
    SELECT id INTO v_result FROM public.candidatos 
    WHERE telefone_normalizado IS NOT NULL 
      AND right(telefone_normalizado, 11) = right(v_cleaned, 11) 
    LIMIT 1;
    IF v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;
  END IF;

  -- Layer 3: Last 10 digits
  IF v_len >= 10 THEN
    SELECT id INTO v_result FROM public.candidatos 
    WHERE telefone_normalizado IS NOT NULL 
      AND right(telefone_normalizado, 10) = right(v_cleaned, 10) 
    LIMIT 1;
    IF v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;
  END IF;

  -- Layer 4: Last 8 digits
  IF v_len >= 8 THEN
    SELECT id INTO v_result FROM public.candidatos 
    WHERE telefone_normalizado IS NOT NULL 
      AND right(telefone_normalizado, 8) = right(v_cleaned, 8) 
    LIMIT 1;
    IF v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;
  END IF;

  RETURN NULL;
END;
$;

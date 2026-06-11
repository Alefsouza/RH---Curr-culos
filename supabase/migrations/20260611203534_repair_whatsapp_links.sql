-- Refine the matching function for better candidate identification
CREATE OR REPLACE FUNCTION public.buscar_candidato_por_telefone(telefone_input text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

  -- Layer 4: Last 9 digits (handles Brazil mobile 9-digit format variances)
  IF v_len >= 9 THEN
    SELECT id INTO v_result FROM public.candidatos 
    WHERE telefone_normalizado IS NOT NULL 
      AND right(telefone_normalizado, 9) = right(v_cleaned, 9) 
    LIMIT 1;
    IF v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;
  END IF;

  -- Layer 5: Last 8 digits (fallback for landlines or significant mismatches)
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
$function$;

-- Run retroactive update to repair existing orphans
DO $$
BEGIN
  UPDATE public.mensagens_whatsapp
  SET candidato_id = public.buscar_candidato_por_telefone(numero_whatsapp)
  WHERE candidato_id IS NULL;
END $$;

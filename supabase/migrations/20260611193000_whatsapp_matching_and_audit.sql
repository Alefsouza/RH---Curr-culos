-- 3. Audit Table
CREATE TABLE IF NOT EXISTS public.whatsapp_eventos_nao_identificados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone_recebido text,
  payload_completo jsonb,
  conteudo text,
  recebido_em timestamp with time zone DEFAULT now(),
  reprocessado boolean DEFAULT false
);

ALTER TABLE public.whatsapp_eventos_nao_identificados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_eventos_nao_identificados_select" ON public.whatsapp_eventos_nao_identificados;
CREATE POLICY "whatsapp_eventos_nao_identificados_select" ON public.whatsapp_eventos_nao_identificados
  FOR SELECT TO authenticated USING (true);

-- 1. Robust Matching Function
CREATE OR REPLACE FUNCTION public.buscar_candidato_por_telefone(telefone_input text)
RETURNS uuid AS $$
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

  -- Attempt 1: Exact match against telefone
  SELECT id INTO v_result FROM public.candidatos WHERE telefone = v_cleaned LIMIT 1;
  IF v_result IS NOT NULL THEN
    RETURN v_result;
  END IF;

  -- Attempt 2: Last 11 digits
  IF v_len >= 11 THEN
    SELECT id INTO v_result FROM public.candidatos WHERE telefone LIKE '%' || right(v_cleaned, 11) LIMIT 1;
    IF v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;
  END IF;

  -- Attempt 3: Last 10 digits
  IF v_len >= 10 THEN
    SELECT id INTO v_result FROM public.candidatos WHERE telefone LIKE '%' || right(v_cleaned, 10) LIMIT 1;
    IF v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;
  END IF;

  -- Attempt 4: Last 8 digits
  IF v_len >= 8 THEN
    SELECT id INTO v_result FROM public.candidatos WHERE telefone LIKE '%' || right(v_cleaned, 8) LIMIT 1;
    IF v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Data Normalization
DO $$
DECLARE
  batch_size INT := 1000;
  affected INT;
BEGIN
  LOOP
    UPDATE public.candidatos
    SET telefone = CASE
      WHEN length(regexp_replace(telefone, '\D', '', 'g')) > 11 AND regexp_replace(telefone, '\D', '', 'g') LIKE '55%' THEN
        substring(regexp_replace(telefone, '\D', '', 'g') from 3)
      ELSE
        regexp_replace(telefone, '\D', '', 'g')
    END
    WHERE telefone IS NOT NULL 
      AND telefone != CASE
        WHEN length(regexp_replace(telefone, '\D', '', 'g')) > 11 AND regexp_replace(telefone, '\D', '', 'g') LIKE '55%' THEN
          substring(regexp_replace(telefone, '\D', '', 'g') from 3)
        ELSE
          regexp_replace(telefone, '\D', '', 'g')
      END
    AND id IN (
      SELECT id FROM public.candidatos 
      WHERE telefone IS NOT NULL 
        AND telefone != CASE
          WHEN length(regexp_replace(telefone, '\D', '', 'g')) > 11 AND regexp_replace(telefone, '\D', '', 'g') LIKE '55%' THEN
            substring(regexp_replace(telefone, '\D', '', 'g') from 3)
          ELSE
            regexp_replace(telefone, '\D', '', 'g')
        END
      LIMIT batch_size
    );
    
    GET DIAGNOSTICS affected = ROW_COUNT;
    EXIT WHEN affected = 0;
    PERFORM pg_sleep(0.1);
  END LOOP;
END $$;

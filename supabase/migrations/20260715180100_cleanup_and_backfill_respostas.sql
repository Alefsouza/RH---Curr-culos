-- Clean up ultima_resposta_whatsapp values that are not "Sim" or "Não"
UPDATE public.candidatos
SET ultima_resposta_whatsapp = NULL
WHERE ultima_resposta_whatsapp IS NOT NULL
  AND ultima_resposta_whatsapp NOT IN ('Sim', 'Não');

-- Backfill from respostas_whatsapp for candidates without a proper Sim/Não response
DO $$
BEGIN
  UPDATE public.candidatos c
  SET ultima_resposta_whatsapp = CASE 
    WHEN r.resposta = 'sim' THEN 'Sim'
    WHEN r.resposta = 'nao' THEN 'Não'
    ELSE r.resposta
  END,
  ultima_resposta_em = COALESCE(r.criado_em, c.ultima_resposta_em)
  FROM (
    SELECT DISTINCT ON (candidato_id) candidato_id, resposta, criado_em
    FROM public.respostas_whatsapp
    WHERE candidato_id IS NOT NULL
      AND LOWER(resposta) IN ('sim', 'nao')
    ORDER BY candidato_id, criado_em DESC
  ) r
  WHERE c.id = r.candidato_id
    AND (
      c.ultima_resposta_whatsapp IS NULL 
      OR c.ultima_resposta_whatsapp = ''
    );
END $$;

-- Ensure telefone_normalizado is populated for all candidates with a telefone
DO $$
DECLARE
  r RECORD;
  v_parts text[];
  v_cleaned_parts text[];
  v_part text;
  v_cleaned text;
  v_result text;
BEGIN
  FOR r IN SELECT id, telefone FROM public.candidatos 
    WHERE telefone IS NOT NULL 
      AND (telefone_normalizado IS NULL OR telefone_normalizado = '') 
  LOOP
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

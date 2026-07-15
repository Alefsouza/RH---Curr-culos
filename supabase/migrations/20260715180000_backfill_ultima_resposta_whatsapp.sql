-- Normalize existing ultima_resposta_whatsapp values to "Sim" or "Não"
UPDATE public.candidatos 
SET ultima_resposta_whatsapp = 'Sim'
WHERE LOWER(ultima_resposta_whatsapp) = 'sim'
  AND ultima_resposta_whatsapp IS DISTINCT FROM 'Sim';

UPDATE public.candidatos 
SET ultima_resposta_whatsapp = 'Não'
WHERE LOWER(ultima_resposta_whatsapp) IN ('nao', 'não')
  AND ultima_resposta_whatsapp IS DISTINCT FROM 'Não';

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
      OR LOWER(c.ultima_resposta_whatsapp) NOT IN ('sim', 'não', 'nao')
    );
END $$;

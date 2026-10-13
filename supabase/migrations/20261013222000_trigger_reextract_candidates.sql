-- Migration: 20261013222000_trigger_reextract_candidates.sql
-- Executa a reextração forçada dos candidatos 0f7fbd80 e 5e7608ad via net.http_post chamando reanalisar-candidato
DO $$
DECLARE
  req1 bigint;
  req2 bigint;
BEGIN
  -- Candidato 1: 0f7fbd80-8e2d-4653-b780-ed990801809a (CV Canva)
  req1 := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-candidato',
    body := '{"candidate_id": "0f7fbd80-8e2d-4653-b780-ed990801809a", "force_reextract": true}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 120000
  );

  -- Candidato 2: 5e7608ad-27a7-40f2-9e6c-ca6017d4cb13
  req2 := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-candidato',
    body := '{"candidate_id": "5e7608ad-27a7-40f2-9e6c-ca6017d4cb13", "force_reextract": true}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 120000
  );

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'trigger_two_candidates_reextract',
    jsonb_build_object('req1', req1, 'req2', req2, 'disparado_em', now())
  );
END $$;

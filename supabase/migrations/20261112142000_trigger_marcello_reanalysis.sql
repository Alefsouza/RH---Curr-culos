-- Migration: 20261112142000_trigger_marcello_reanalysis.sql
-- Disparo da Edge Function reanalisar-candidato para Marcello de S. Campos
-- (id fe78abd9-462c-4397-83b2-22a62cc6abcb), já restaurado (deleted_at NULL).
-- Objetivo genérico "A disposição da empresa" → caminho corrigido ignora target_vaga_id
-- e avalia TODAS as vagas abertas via identify-vaga-from-cv.
DO $$
DECLARE
  req_id bigint;
BEGIN
  req_id := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-candidato',
    body := '{"candidate_id": "fe78abd9-462c-4397-83b2-22a62cc6abcb", "force_reextract": false}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 90000
  );
  RAISE NOTICE 'pg_net request_id disparada para Marcello de S. Campos: %', req_id;
END $$;

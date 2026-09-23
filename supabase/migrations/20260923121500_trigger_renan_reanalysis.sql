-- Migration: 20260923121500_trigger_renan_reanalysis.sql
-- Disparo da Edge Function reanalisar-candidato para o Renan Lucas de Mello Brasileiro
DO $$
DECLARE
  req_id bigint;
BEGIN
  req_id := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-candidato',
    body := '{"candidate_id": "fedeb8c0-f0f8-4181-9eff-fb7199874e3f", "force_reextract": false}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 60000
  );
  RAISE NOTICE 'pg_net request_id disparada para Renan: %', req_id;
END $$;

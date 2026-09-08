-- Migration: 20260908202500_trigger_henrique_reanalysis_longer_timeout.sql
-- Invocação da Edge Function reanalisar-candidato para o Henrique Amâncio via pg_net com timeout de 60s
DO $$
DECLARE
  req_id bigint;
BEGIN
  req_id := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-candidato',
    body := '{"candidate_id": "9c351c31-33cd-45c9-b024-29f5abb0927e", "force_reextract": false}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 60000
  );
  RAISE NOTICE 'pg_net request_id: %', req_id;
END $$;

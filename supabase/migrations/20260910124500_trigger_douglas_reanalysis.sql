-- Migration: 20260910124500_trigger_douglas_reanalysis.sql
-- Invocação da Edge Function reanalisar-candidato para o Douglas Almeida Silva via pg_net
DO $$
DECLARE
  req_id bigint;
BEGIN
  req_id := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-candidato',
    body := '{"candidate_id": "53cd9ef9-5029-45b1-9fbf-d2b255d57ed4", "force_reextract": false}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 60000
  );
  RAISE NOTICE 'pg_net request_id: %', req_id;
END $$;

-- Migration: 20260915100000_trigger_robisom_reanalysis.sql
-- Invocação da Edge Function reanalisar-candidato para o Robisom Alves de Lima Mello via pg_net
DO $$
DECLARE
  req_id bigint;
BEGIN
  req_id := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-candidato',
    body := '{"candidate_id": "ad3f9fe5-905a-4e7e-adce-a803772da937", "force_reextract": true}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 60000
  );
  RAISE NOTICE 'pg_net request_id disparada para Robisom: %', req_id;
END $$;

-- Migration: 20260910124600_check_and_trigger_douglas.sql
DO $$
DECLARE
  req_id bigint;
  auth_header text;
BEGIN
  req_id := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/analisar-cv-criterios',
    body := '{"cv_id": "53cd9ef9-5029-45b1-9fbf-d2b255d57ed4", "vaga_id": "4c4239c0-fd38-47e7-92fe-9bb5a3b02db2"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 60000
  );
  RAISE NOTICE 'pg_net direct analisar-cv-criterios request_id: %', req_id;
END $$;

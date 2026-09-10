-- Migration: 20260910130000_invoke_douglas_reanalysis.sql
-- Dispara a reanálise do candidato Douglas Almeida Silva após deploy das correções da CNH D ou E
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
  RAISE NOTICE 'pg_net reanalise request_id disparada para Douglas: %', req_id;
END $$;

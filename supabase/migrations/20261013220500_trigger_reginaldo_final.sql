-- Migration: 20261013220500_trigger_reginaldo_final.sql
DO $$
DECLARE
  req_id bigint;
BEGIN
  req_id := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-candidato',
    body := '{"candidate_id": "eb704d64-6e02-401c-a984-48c1de69ffdb", "force_reextract": false}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 120000
  );

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'trigger_reginaldo_final',
    jsonb_build_object('request_id', req_id, 'started_at', now())
  );
END $$;

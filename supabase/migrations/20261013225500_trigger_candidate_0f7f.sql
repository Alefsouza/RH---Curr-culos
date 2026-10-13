-- Migration: 20261013225500_trigger_candidate_0f7f.sql
DO $$
DECLARE
  req1 bigint;
BEGIN
  req1 := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-candidato',
    body := '{"candidate_id": "0f7fbd80-8e2d-4653-b780-ed990801809a", "force_reextract": true}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 120000
  );

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'trigger_candidate_0f7f',
    jsonb_build_object('req1', req1, 'time', now())
  );
END $$;

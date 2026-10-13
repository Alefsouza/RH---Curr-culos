-- Migration: 20261013202500_invoke_batch_reanalysis_cobradores.sql
DO $$
DECLARE
  req_id bigint;
BEGIN
  req_id := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-cobradores-proximidade',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'trigger_batch_cobradores',
    jsonb_build_object('req_id', req_id, 'disparado_em', now())
  );
END $$;

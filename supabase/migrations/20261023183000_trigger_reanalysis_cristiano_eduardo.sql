-- Migration para disparar a reanálise de Cristiano Tomochigue e Eduardo Francisco via reanalisar-candidato
DO $$
DECLARE
  req_cris bigint;
  req_edu bigint;
BEGIN
  -- 1. Cristiano Tomochigue (18cb75de-2c11-47b7-8caf-f1c6f7b41ba0)
  req_cris := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-candidato',
    body := '{"candidate_id": "18cb75de-2c11-47b7-8caf-f1c6f7b41ba0", "force_reextract": false}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 120000
  );

  -- 2. Eduardo Francisco De Freitas (cdbbf741-e60d-451f-9427-fdbc79310a81)
  req_edu := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-candidato',
    body := '{"candidate_id": "cdbbf741-e60d-451f-9427-fdbc79310a81", "force_reextract": false}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 120000
  );

  -- Log em _debug_audit
  INSERT INTO public._debug_audit (tag, info) VALUES (
    'trigger_cristiano_eduardo_v667',
    jsonb_build_object(
      'req_cris', req_cris,
      'req_edu', req_edu,
      'disparado_em', now()
    )
  );
END $$;

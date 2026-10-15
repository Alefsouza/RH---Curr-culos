-- Migration: 20261015210000_check_active_version.sql
DO $$
DECLARE
  req_id bigint;
  v_resp RECORD;
  v_attempts int := 0;
  v_done boolean := false;
BEGIN
  -- Teste chamando reanalisar-candidato com OPTIONS (preflight CORS) ou POST vazio
  req_id := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-candidato',
    body := '{"candidate_id": ""}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 30000
  );

  WHILE v_attempts < 15 AND NOT v_done LOOP
    SELECT id, status_code, content, error_msg 
    INTO v_resp
    FROM net._http_response
    WHERE id = req_id;

    IF v_resp.id IS NOT NULL THEN
      v_done := true;
    ELSE
      PERFORM pg_sleep(2);
      v_attempts := v_attempts + 1;
    END IF;
  END LOOP;

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'check_active_version',
    jsonb_build_object(
      'req_id', req_id,
      'status_code', v_resp.status_code,
      'content', v_resp.content,
      'error_msg', v_resp.error_msg
    )
  );

  RAISE NOTICE 'Response: status=%, content=%', v_resp.status_code, v_resp.content;
END $$;

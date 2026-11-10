-- Investigar a chamada net.http_post para reanalisar-candidato especificamente
DO $$
DECLARE
  v_req BIGINT;
  v_resp RECORD;
BEGIN
  v_req := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-candidato',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('candidate_id', '05dd2f8b-5637-4124-a781-35c375cc754a', 'force_reextract', false),
    timeout_milliseconds := 120000
  );

  PERFORM pg_sleep(5.0);

  SELECT * INTO v_resp
    FROM net._http_response
   WHERE id = v_req;

  INSERT INTO public._debug_audit (tag, info, created_at)
  VALUES (
    'debug_reanalise_catiana_direct_resp',
    jsonb_build_object(
      'req_id', v_req,
      'status_code', v_resp.status_code,
      'error_msg', v_resp.error_msg,
      'content', v_resp.content
    ),
    NOW()
  );
END $$;

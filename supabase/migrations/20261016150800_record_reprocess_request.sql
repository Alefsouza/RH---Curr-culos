-- Dispara a requisição capturando o request_id e insere em _debug_audit
DO $$
DECLARE
  v_req_id bigint;
BEGIN
  v_req_id := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/sync-outlook-cvs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'reprocessEmailImportIds', jsonb_build_array(
        '45ae0f1e-2cd6-42ad-bd63-03dc110ffeeb',
        '92d75e76-06e4-476e-a320-10957c3a5f7a'
      )
    ),
    timeout_milliseconds := 120000
  );

  INSERT INTO public._debug_audit (tag, info)
  VALUES ('reprocess_marcos_request_id', jsonb_build_object('req_id', v_req_id));
END $$;

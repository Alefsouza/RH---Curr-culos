-- Verifica se o lote processou ou se Graph / timeout precisa de lote menor
DO $$
DECLARE
  v_resp RECORD;
  v_req_id bigint;
  v_erro_count int;
  v_audit RECORD;
  v_msg text;
BEGIN
  SELECT count(*) INTO v_erro_count
  FROM public.email_importacoes
  WHERE erro_detalhes = 'extractedText is not defined' AND candidato_id IS NULL;

  SELECT id, status_code, content, error_msg INTO v_resp
  FROM net._http_response
  ORDER BY created DESC
  LIMIT 1;

  INSERT INTO public._debug_audit (tag, info)
  VALUES ('inspect_batch_1_net', jsonb_build_object(
    'erro_count', v_erro_count,
    'status_code', v_resp.status_code,
    'error_msg', v_resp.error_msg,
    'content', LEFT(v_resp.content, 400)
  ));
END $$;

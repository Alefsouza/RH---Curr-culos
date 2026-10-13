-- Migration: 20261013203000_check_batch_cobradores_result.sql
DO $$
DECLARE
  v_resp RECORD;
BEGIN
  SELECT id, status_code, substring(content from 1 for 1000) as c, error_msg INTO v_resp
  FROM net._http_response
  ORDER BY id DESC
  LIMIT 1;

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'batch_cobradores_result',
    jsonb_build_object(
      'resp_id', v_resp.id,
      'status_code', v_resp.status_code,
      'error_msg', v_resp.error_msg,
      'content', v_resp.c
    )
  );

  RAISE NOTICE 'Batch Cobradores: status=%, error=%', v_resp.status_code, v_resp.error_msg;
END $$;

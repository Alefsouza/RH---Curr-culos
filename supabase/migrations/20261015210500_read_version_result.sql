-- Migration: 20261015210500_read_version_result.sql
DO $$
DECLARE
  v_resp RECORD;
BEGIN
  -- Verificar o registro 114914 após aguardar
  SELECT id, status_code, content, error_msg
  INTO v_resp
  FROM net._http_response
  WHERE id = 114914;

  RAISE EXCEPTION 'Request 114914: id=%, status=%, error=%, content=%', v_resp.id, v_resp.status_code, v_resp.error_msg, v_resp.content;
END $$;

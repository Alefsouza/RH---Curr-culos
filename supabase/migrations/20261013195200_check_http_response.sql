-- Migration: 20261013195200_check_http_response.sql
DO $$
DECLARE
  v_resp RECORD;
BEGIN
  SELECT id, status_code, content, error_msg INTO v_resp
  FROM net._http_response
  ORDER BY id DESC
  LIMIT 1;

  IF v_resp.id IS NOT NULL THEN
    RAISE NOTICE 'net._http_response: id=%, status=%, error=%', v_resp.id, v_resp.status_code, v_resp.error_msg;
  ELSE
    RAISE NOTICE 'Sem registros em net._http_response ainda';
  END IF;
END $$;

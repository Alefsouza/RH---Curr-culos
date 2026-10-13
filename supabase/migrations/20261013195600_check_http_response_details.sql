-- Migration: 20261013195600_check_http_response_details.sql
DO $$
DECLARE
  v_resp RECORD;
BEGIN
  FOR v_resp IN SELECT id, status_code, substring(content from 1 for 300) as c, error_msg FROM net._http_response ORDER BY id DESC LIMIT 5 LOOP
    RAISE NOTICE 'Completed response: id=%, status=%, error=%, content=%', v_resp.id, v_resp.status_code, v_resp.error_msg, v_resp.c;
  END LOOP;
END $$;

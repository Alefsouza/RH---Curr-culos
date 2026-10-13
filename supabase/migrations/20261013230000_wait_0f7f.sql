-- Migration: 20261013230000_wait_0f7f.sql
DO $$
DECLARE
  v_req_id bigint;
  v_attempts int := 0;
  v_done boolean := false;
  v_rec record;
BEGIN
  SELECT (info->>'req1')::bigint INTO v_req_id
  FROM public._debug_audit
  WHERE tag = 'trigger_candidate_0f7f'
  ORDER BY created_at DESC
  LIMIT 1;

  LOOP
    SELECT EXISTS (SELECT 1 FROM net._http_response WHERE id = v_req_id) INTO v_done;
    EXIT WHEN v_done OR v_attempts >= 45;
    PERFORM pg_sleep(1);
    v_attempts := v_attempts + 1;
  END LOOP;

  SELECT id, status_code, timed_out, error_msg, substring(content from 1 for 1000) as resp INTO v_rec
  FROM net._http_response
  WHERE id = v_req_id;

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'res_0f7f',
    jsonb_build_object(
      'req_id', v_req_id,
      'status_code', v_rec.status_code,
      'timed_out', v_rec.timed_out,
      'error_msg', v_rec.error_msg,
      'content', v_rec.resp,
      'waited', v_attempts
    )
  );
END $$;

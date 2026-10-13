-- Migration: 20261013222500_wait_and_check_responses.sql
DO $$
DECLARE
  v_count int := 0;
  v_attempts int := 0;
  v_rec record;
BEGIN
  LOOP
    SELECT count(*) INTO v_count
    FROM net._http_response
    WHERE id IN (113333, 113334);

    EXIT WHEN v_count = 2 OR v_attempts >= 40;

    PERFORM pg_sleep(1);
    v_attempts := v_attempts + 1;
  END LOOP;

  FOR v_rec IN (
    SELECT id, status_code, timed_out, error_msg, substring(content from 1 for 1000) as resp_content
    FROM net._http_response
    WHERE id IN (113333, 113334)
  ) LOOP
    INSERT INTO public._debug_audit (tag, info) VALUES (
      'response_check_' || v_rec.id,
      jsonb_build_object(
        'id', v_rec.id,
        'status_code', v_rec.status_code,
        'timed_out', v_rec.timed_out,
        'error_msg', v_rec.error_msg,
        'content', v_rec.resp_content,
        'waited_seconds', v_attempts
      )
    );
  END LOOP;
END $$;

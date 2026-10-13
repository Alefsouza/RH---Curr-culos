-- Migration: 20261013223000_check_http_responses.sql
DO $$
DECLARE
  v_rec record;
BEGIN
  FOR v_rec IN (
    SELECT id, status_code, timed_out, error_msg, content
    FROM net._http_response
    WHERE id IN (113333, 113334)
  ) LOOP
    INSERT INTO public._debug_audit (tag, info) VALUES (
      'log_response_' || v_rec.id,
      jsonb_build_object(
        'id', v_rec.id,
        'status_code', v_rec.status_code,
        'timed_out', v_rec.timed_out,
        'error_msg', v_rec.error_msg,
        'content', v_rec.content
      )
    );
  END LOOP;
END $$;

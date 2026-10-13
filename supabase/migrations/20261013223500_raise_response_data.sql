-- Migration: 20261013223500_raise_response_data.sql
DO $$
DECLARE
  v_rec record;
  v_msg text := '';
BEGIN
  FOR v_rec IN (
    SELECT id, tag, info
    FROM public._debug_audit
    WHERE tag LIKE 'response_check_%' OR tag LIKE 'log_response_%'
    ORDER BY created_at DESC
    LIMIT 4
  ) LOOP
    v_msg := v_msg || ' [' || v_rec.tag || ': ' || v_rec.info::text || '] ';
  END LOOP;

  IF length(v_msg) > 0 THEN
    RAISE EXCEPTION 'AUDIT_LOGS: %', v_msg;
  ELSE
    RAISE EXCEPTION 'AUDIT_LOGS: NONE';
  END IF;
END $$;

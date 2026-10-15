-- Migration: 20261015203500_verify_reginaldo_audit.sql
DO $$
DECLARE
  v_audit RECORD;
BEGIN
  SELECT id, tag, info, created_at
  INTO v_audit
  FROM public._debug_audit
  WHERE tag = 'test_reginaldo_reanalysis_result'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_audit.id IS NULL THEN
    RAISE EXCEPTION 'Audit record not found for test_reginaldo_reanalysis_result';
  END IF;

  -- Se resp_status_code foi 200, podemos logar em notice
  RAISE NOTICE 'Audit result: %', v_audit.info;

  IF (v_audit.info->>'resp_status_code')::int != 200 THEN
    RAISE EXCEPTION 'Status code was not 200: %', v_audit.info;
  END IF;
END $$;

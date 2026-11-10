-- Inspeciona se catiana_assertion_passed foi gravado
DO $$
DECLARE
  v_rec record;
BEGIN
  SELECT * INTO v_rec FROM public._debug_audit WHERE tag = 'catiana_assertion_passed' ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE NOTICE 'ALERTA: catiana_assertion_passed NÃO encontrado!';
  ELSE
    RAISE NOTICE 'ASSERTION PASSED: %', v_rec.info::text;
  END IF;
END $$;

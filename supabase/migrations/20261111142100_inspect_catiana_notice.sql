-- Inspeciona info de catiana_reanalise_check_v709 e levanta NOTICE
DO $$
DECLARE
  v_rec record;
BEGIN
  SELECT * INTO v_rec FROM public._debug_audit WHERE tag = 'catiana_reanalise_check_v709' ORDER BY created_at DESC LIMIT 1;
  RAISE NOTICE 'AUDIT CATIANA: %', v_rec.info::text;
END $$;

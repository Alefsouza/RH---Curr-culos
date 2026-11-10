-- Ler o debug_reanalise_catiana_direct_resp gerado
DO $$
DECLARE
  v_info JSONB;
BEGIN
  SELECT info INTO v_info
    FROM public._debug_audit
   WHERE tag = 'debug_reanalise_catiana_direct_resp'
   ORDER BY created_at DESC
   LIMIT 1;

  RAISE NOTICE 'DIRECT RESP CATIANA: %', v_info;
END $$;

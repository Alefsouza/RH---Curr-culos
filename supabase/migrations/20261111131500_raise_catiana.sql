-- Migration: Raise notice dos detalhes de Catiana e do HTTP
DO $$
DECLARE
  v_info JSONB;
BEGIN
  SELECT info INTO v_info
    FROM public._debug_audit
   WHERE tag = 'catiana_inspecao_detalhada'
   ORDER BY created_at DESC
   LIMIT 1;

  RAISE NOTICE 'INSPECAO CATIANA: %', v_info;
END $$;

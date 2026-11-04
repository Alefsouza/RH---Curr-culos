-- Migration: 20261104150600_relatorio_protegidos_v0695.sql
-- Relatório da conferência dos protegidos: lê a auditoria e emite RAISE NOTICE.
DO $$
DECLARE
  v_info jsonb;
BEGIN
  SELECT info::jsonb INTO v_info
    FROM public._debug_audit
    WHERE tag = 'protegidos_intocados_v0695'
    ORDER BY created_at DESC LIMIT 1;

  RAISE NOTICE 'PROTEGIDOS_v0695 RELATORIO: %', COALESCE(v_info::text, 'sem registro');
END $$;

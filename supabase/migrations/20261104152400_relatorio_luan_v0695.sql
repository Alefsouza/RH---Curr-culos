-- Migration: 20261104152400_relatorio_luan_v0695.sql
-- Relatório final da reanálise do Luan (v0.0.695): lê os registros de auditoria
-- (resposta pg_net + estado final) e emite RAISE NOTICE. Nenhuma alteração de dados.
DO $$
DECLARE
  v_net jsonb;
  v_final jsonb;
BEGIN
  SELECT info::jsonb INTO v_net
    FROM public._debug_audit
    WHERE tag = 'luan_reanalysis_net_response'
    ORDER BY created_at DESC LIMIT 1;

  SELECT info::jsonb INTO v_final
    FROM public._debug_audit
    WHERE tag = 'luan_reanalysis_final_state'
    ORDER BY created_at DESC LIMIT 1;

  RAISE NOTICE 'LUAN_v0695 NET: %', COALESCE(v_net::text, 'sem registro');
  RAISE NOTICE 'LUAN_v0695 ESTADO_FINAL: %', COALESCE(v_final::text, 'sem registro');
END $$;

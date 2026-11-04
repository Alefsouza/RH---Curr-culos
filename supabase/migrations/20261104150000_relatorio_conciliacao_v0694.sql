-- Migration: Leitura do relatório da conciliação dos falsos 'aguardando' (v0.0.694)
-- Regra do usuário: relatórios em migração usam RAISE NOTICE (nunca EXCEPTION)
-- e cast ::jsonb explícito antes de qualquer acesso a chave.
-- Nenhuma alteração de dados nesta migração.

DO $$
DECLARE
  v_info jsonb;
BEGIN
  SELECT info::jsonb INTO v_info
  FROM public._debug_audit
  WHERE tag = 'conciliacao_falsos_aguardando_v0694_corrigida'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_info IS NULL THEN
    RAISE NOTICE 'CONCILIACAO v0694: relatorio NAO encontrado para a tag conciliacao_falsos_aguardando_v0694_corrigida';
  ELSE
    RAISE NOTICE 'CONCILIACAO v0694 CORRIGIDA — relatorio completo: %', v_info::text;
    RAISE NOTICE 'CONCILIACAO v0694 — lote_total: %', COALESCE(v_info->>'lote_total', v_info->>'total_lote', '?');
    RAISE NOTICE 'CONCILIACAO v0694 — reanalisados/concluidos: %', COALESCE(v_info->>'reanalisados', v_info->>'concluidos', '?');
    RAISE NOTICE 'CONCILIACAO v0694 — ativados: %', COALESCE(v_info->>'ativados', '?');
    RAISE NOTICE 'CONCILIACAO v0694 — aguardando_com_analise: %', COALESCE(v_info->>'aguardando_com_analise', '?');
    RAISE NOTICE 'CONCILIACAO v0694 — erros: %', COALESCE(v_info->>'erros', v_info->>'erros_lote', '?');
    RAISE NOTICE 'CONCILIACAO v0694 — outros/pendentes: %', COALESCE(v_info->>'outros', v_info->>'pendentes', '?');
  END IF;
END $$;

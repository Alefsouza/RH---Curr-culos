-- Migration: 20261002201500_assert_leonardo_state.sql
-- Validação estrita do estado final do candidato Leonardo Augusto Damasceno (45251712-9216-42da-811c-4ba82e4fd993)
DO $$
DECLARE
  v_cand record;
  v_analise record;
  v_motivo text;
  v_summary text;
BEGIN
  SELECT id, nome, vaga_id, etapa_id, ativo_kanban, motivo_inativo
  INTO v_cand
  FROM public.candidatos
  WHERE id = '45251712-9216-42da-811c-4ba82e4fd993';

  IF v_cand.id IS NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Leonardo não encontrado no banco';
  END IF;

  SELECT id, vaga_id, resultado, detalhes
  INTO v_analise
  FROM public.analises
  WHERE candidato_id = v_cand.id
  ORDER BY criado_em DESC
  LIMIT 1;

  IF v_analise.id IS NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Nenhuma análise encontrada para Leonardo';
  END IF;

  IF v_analise.resultado <> 'nao_qualificado' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Resultado esperado era nao_qualificado mas obteve %', v_analise.resultado;
  END IF;

  v_motivo := COALESCE(v_analise.detalhes->>'motivo', '');
  v_summary := COALESCE(v_analise.detalhes->>'summary', '');

  IF v_motivo ILIKE '%20 anos de experiência como motorista%' OR v_summary ILIKE '%20 anos de experiência como motorista%' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Motivo ou resumo ainda alega 20 anos de experiência como motorista';
  END IF;

  RAISE NOTICE 'ASSERTION SUCCESS: Leonardo devidamente validado! Candidato id: %, resultado: %, score: %, motivo: %',
    v_cand.id, v_analise.resultado, v_analise.detalhes->>'score', v_motivo;
END $$;

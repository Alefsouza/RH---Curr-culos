-- Migration: 20261013195000_verify_valdecir_reanalysis.sql
-- Validação do status pós reanálise de Valdecir Dias Batista
DO $$
DECLARE
  v_cand RECORD;
  v_vaga RECORD;
  v_analise RECORD;
BEGIN
  SELECT id, nome, vaga_id INTO v_cand
  FROM public.candidatos
  WHERE id = '08ba889b-562d-4ad8-bae7-0d857a6826d8';

  SELECT id, titulo INTO v_vaga
  FROM public.vagas
  WHERE id = v_cand.vaga_id;

  SELECT id, vaga_id, resultado, detalhes INTO v_analise
  FROM public.analises
  WHERE candidato_id = '08ba889b-562d-4ad8-bae7-0d857a6826d8'
  ORDER BY criado_em DESC
  LIMIT 1;

  RAISE NOTICE 'Candidato: %, Vaga atual: % (%)', v_cand.nome, v_vaga.titulo, v_cand.vaga_id;
  RAISE NOTICE 'Analise recente: vaga_id=%, resultado=%', v_analise.vaga_id, v_analise.resultado;
END $$;

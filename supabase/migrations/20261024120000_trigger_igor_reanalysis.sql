-- 1. Verifica estado do candidato Igor e última análise gerada
DO $$
DECLARE
  v_cand RECORD;
  v_analise RECORD;
  v_audit RECORD;
BEGIN
  SELECT id, vaga_id, ativo_kanban, motivo_inativo, dados_extraidos
  INTO v_cand
  FROM public.candidatos
  WHERE id = '46ab0280-e34b-4d78-b333-1d42d0581415';

  SELECT id, candidato_id, vaga_id, resultado, detalhes, criado_em
  INTO v_analise
  FROM public.analises
  WHERE candidato_id = '46ab0280-e34b-4d78-b333-1d42d0581415'
  ORDER BY criado_em DESC
  LIMIT 1;

  RAISE NOTICE 'CANDIDATO: vaga_id=%, ativo_kanban=%, motivo_inativo=%, data_nascimento=%, idade=%',
    v_cand.vaga_id, v_cand.ativo_kanban, v_cand.motivo_inativo,
    v_cand.dados_extraidos->>'data_nascimento', v_cand.dados_extraidos->>'idade';

  RAISE NOTICE 'ANALISE: id=%, vaga_id=%, resultado=%, criado_em=%, motivo=%',
    v_analise.id, v_analise.vaga_id, v_analise.resultado, v_analise.criado_em,
    v_analise.detalhes->>'motivo';

  -- Salvar auditoria
  INSERT INTO public._debug_audit (tag, info) VALUES (
    'check_igor_status_after_trigger',
    jsonb_build_object(
      'cand_vaga_id', v_cand.vaga_id,
      'cand_ativo_kanban', v_cand.ativo_kanban,
      'cand_motivo_inativo', v_cand.motivo_inativo,
      'cand_data_nascimento', v_cand.dados_extraidos->>'data_nascimento',
      'cand_idade', v_cand.dados_extraidos->>'idade',
      'analise_id', v_analise.id,
      'analise_vaga_id', v_analise.vaga_id,
      'analise_resultado', v_analise.resultado,
      'analise_motivo', v_analise.detalhes->>'motivo',
      'analise_criado_em', v_analise.criado_em
    )
  );
END $$;

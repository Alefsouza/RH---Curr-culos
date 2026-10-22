-- Migration: wait_and_check_eduardo_result.sql
-- Aguarda o processamento do request pg_net e valida a análise do Eduardo
DO $$
DECLARE
  v_resp RECORD;
  v_attempts int := 0;
  v_done boolean := false;
  v_cand RECORD;
  v_analise RECORD;
BEGIN
  -- Aguarda resposta do req_id 120 ou qualquer resposta recente de net
  WHILE v_attempts < 30 AND NOT v_done LOOP
    SELECT id, status_code, content, error_msg 
    INTO v_resp
    FROM net._http_response
    WHERE id = 120;

    IF v_resp.id IS NOT NULL THEN
      v_done := true;
    ELSE
      PERFORM pg_sleep(2);
      v_attempts := v_attempts + 1;
    END IF;
  END LOOP;

  SELECT id, nome, vaga_id, etapa_id, ativo_kanban, motivo_inativo
  INTO v_cand
  FROM public.candidatos
  WHERE id = 'cdbbf741-e60d-451f-9427-fdbc79310a81';

  SELECT id, candidato_id, vaga_id, resultado, detalhes, criado_em
  INTO v_analise
  FROM public.analises
  WHERE candidato_id = 'cdbbf741-e60d-451f-9427-fdbc79310a81'
  ORDER BY criado_em DESC
  LIMIT 1;

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'eduardo_final_validation',
    jsonb_build_object(
      'resp_status_code', v_resp.status_code,
      'resp_content', substring(COALESCE(v_resp.content, '') from 1 for 1000),
      'resp_error_msg', v_resp.error_msg,
      'candidato_nome', v_cand.nome,
      'candidato_vaga_id', v_cand.vaga_id,
      'candidato_ativo_kanban', v_cand.ativo_kanban,
      'candidato_motivo_inativo', v_cand.motivo_inativo,
      'analise_id', v_analise.id,
      'analise_resultado', v_analise.resultado,
      'analise_motivo', v_analise.detalhes->>'motivo',
      'analise_score', v_analise.detalhes->'score',
      'analise_criado_em', v_analise.criado_em
    )
  );

  RAISE NOTICE 'Eduardo analise: id=%, resultado=%, motivo=%',
    v_analise.id, v_analise.resultado, v_analise.detalhes->>'motivo';
END $$;

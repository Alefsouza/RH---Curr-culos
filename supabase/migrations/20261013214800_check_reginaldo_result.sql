-- Migration: 20261013214800_check_reginaldo_result.sql
-- Espera e verifica o resultado da reanálise de Reginaldo Barbosa da Silva
DO $$
DECLARE
  v_resp RECORD;
  v_cand RECORD;
  v_analise RECORD;
  v_attempts int := 0;
  v_done boolean := false;
BEGIN
  -- Polling por até ~45 segundos para a conclusão da requisição HTTP assíncrona
  WHILE v_attempts < 15 AND NOT v_done LOOP
    SELECT id, status_code, content, error_msg 
    INTO v_resp
    FROM net._http_response
    WHERE id = 113296;

    IF v_resp.id IS NOT NULL THEN
      v_done := true;
    ELSE
      PERFORM pg_sleep(3);
      v_attempts := v_attempts + 1;
    END IF;
  END LOOP;

  SELECT id, nome, email, telefone, vaga_id, etapa_id, ativo_kanban, dados_extraidos
  INTO v_cand
  FROM public.candidatos
  WHERE id = 'eb704d64-6e02-401c-a984-48c1de69ffdb';

  SELECT id, candidato_id, vaga_id, resultado, detalhes, criado_em
  INTO v_analise
  FROM public.analises
  WHERE candidato_id = 'eb704d64-6e02-401c-a984-48c1de69ffdb'
  ORDER BY criado_em DESC
  LIMIT 1;

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'reginaldo_check_status',
    jsonb_build_object(
      'resp_status_code', v_resp.status_code,
      'resp_content', substring(COALESCE(v_resp.content, '') from 1 for 1000),
      'resp_error_msg', v_resp.error_msg,
      'candidato_nome', v_cand.nome,
      'candidato_vaga_id', v_cand.vaga_id,
      'candidato_etapa_id', v_cand.etapa_id,
      'candidato_ativo_kanban', v_cand.ativo_kanban,
      'candidato_cep', v_cand.dados_extraidos->>'cep',
      'candidato_endereco', v_cand.dados_extraidos->>'endereco',
      'candidato_dados_extraidos', v_cand.dados_extraidos,
      'analise_id', v_analise.id,
      'analise_resultado', v_analise.resultado,
      'analise_detalhes', v_analise.detalhes,
      'analise_criado_em', v_analise.criado_em
    )
  );
END $$;

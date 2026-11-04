-- Migration: 20261104150200_check_luan_reanalysis.sql
-- Concilia a requisição pg_net do disparo do Luan (req_id em _debug_audit,
-- tag 'trigger_luan_reanalysis_grafia') e registra o estado FINAL dele:
-- candidato, última análise (distância/método/grafia) e resposta HTTP bruta.
-- Regra: cast ::jsonb explícito, RAISE NOTICE (nunca EXCEPTION).
DO $$
DECLARE
  v_req_id bigint;
  v_resp RECORD;
  v_cand RECORD;
  v_analise RECORD;
BEGIN
  PERFORM pg_sleep(12);

  SELECT (info->>'req_id')::bigint INTO v_req_id
    FROM public._debug_audit
    WHERE tag = 'trigger_luan_reanalysis_grafia'
    ORDER BY created_at DESC
    LIMIT 1;

  IF v_req_id IS NOT NULL THEN
    SELECT status_code, error_msg, content INTO v_resp
      FROM net._http_response
      WHERE id = v_req_id;

    INSERT INTO public._debug_audit (tag, info)
    VALUES ('luan_reanalysis_net_response', jsonb_build_object(
      'req_id', v_req_id,
      'status_code', v_resp.status_code,
      'error_msg', v_resp.error_msg,
      'content', LEFT(v_resp.content, 2000),
      'quando', now()
    ));

    RAISE NOTICE 'LUAN_NET: req_id=% status=% err=% resp=%',
      v_req_id, v_resp.status_code, v_resp.error_msg, LEFT(v_resp.content, 800);
  ELSE
    RAISE NOTICE 'LUAN_NET: req_id nao encontrado na auditoria';
  END IF;

  SELECT nome, vaga_id, ativo_kanban, motivo_inativo, dados_extraidos->>'endereco' AS endereco
    INTO v_cand
    FROM public.candidatos
    WHERE id = 'a71cb42e-1a9f-4ef6-a205-75197fb34a9d'::uuid;

  SELECT vaga_id, resultado, criado_em,
         detalhes->>'distancia_km' AS dist_km,
         detalhes->>'metodo_geolocalizacao' AS metodo,
         detalhes->>'bairro_interpretado' AS bairro_interpretado,
         detalhes->>'motivo' AS motivo
    INTO v_analise
    FROM public.analises
    WHERE candidato_id = 'a71cb42e-1a9f-4ef6-a205-75197fb34a9d'::uuid
    ORDER BY criado_em DESC
    LIMIT 1;

  RAISE NOTICE 'LUAN_CANDIDATO: vaga=% ativo=% motivo=% endereco=%',
    v_cand.vaga_id, v_cand.ativo_kanban, v_cand.motivo_inativo, v_cand.endereco;
  RAISE NOTICE 'LUAN_ANALISE: vaga=% resultado=% criado_em=% dist_km=% metodo=% bairro_interpretado=%',
    v_analise.vaga_id, v_analise.resultado, v_analise.criado_em,
    v_analise.dist_km, v_analise.metodo, v_analise.bairro_interpretado;
  RAISE NOTICE 'LUAN_MOTIVO: %', v_analise.motivo;

  INSERT INTO public._debug_audit (tag, info)
  VALUES ('luan_reanalysis_final_state', jsonb_build_object(
    'candidato', jsonb_build_object(
      'vaga_id', v_cand.vaga_id,
      'ativo_kanban', v_cand.ativo_kanban,
      'motivo_inativo', v_cand.motivo_inativo,
      'endereco', v_cand.endereco
    ),
    'analise', jsonb_build_object(
      'vaga_id', v_analise.vaga_id,
      'resultado', v_analise.resultado,
      'criado_em', v_analise.criado_em,
      'distancia_km', v_analise.dist_km,
      'metodo_geolocalizacao', v_analise.metodo,
      'bairro_interpretado', v_analise.bairro_interpretado,
      'motivo', v_analise.motivo
    ),
    'quando', now()
  ));
END $$;

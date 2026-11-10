-- Verifica resposta da Catiana no net._http_response e status dela no banco
DO $$
DECLARE
  v_resp record;
  v_cand record;
  v_analise record;
BEGIN
  -- Espera até 20 segundos se req 15511 ainda não respondeu
  FOR i IN 1..10 LOOP
    SELECT * INTO v_resp FROM net._http_response WHERE id = 15511;
    IF FOUND THEN
      EXIT;
    END IF;
    PERFORM pg_sleep(2);
  END LOOP;

  SELECT id, nome, vaga_id, etapa_id, ativo_kanban, motivo_inativo INTO v_cand
  FROM public.candidatos
  WHERE id = '05dd2f8b-5637-4124-a781-35c375cc754a';

  SELECT id, vaga_id, resultado, detalhes, criado_em INTO v_analise
  FROM public.analises
  WHERE candidato_id = '05dd2f8b-5637-4124-a781-35c375cc754a'
  ORDER BY criado_em DESC LIMIT 1;

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'catiana_reanalise_check_v709',
    jsonb_build_object(
      'resp_status', v_resp.status_code,
      'resp_content', substring(v_resp.content from 1 for 500),
      'resp_error', v_resp.error_msg,
      'candidato', to_jsonb(v_cand),
      'analise_resultado', v_analise.resultado,
      'analise_vaga_id', v_analise.vaga_id,
      'analise_detalhes_motivo', v_analise.detalhes->>'motivo',
      'analise_criada_em', v_analise.criado_em
    )
  );

  RAISE NOTICE 'Catiana verificada: status_code=%, vaga_id=%, motivo_inativo=%, analise_resultado=%',
    v_resp.status_code, v_cand.vaga_id, v_cand.motivo_inativo, v_analise.resultado;
END $$;

-- Espera a resposta da requisição net e inspeciona analises da Catiana
DO $$
DECLARE
  v_cand record;
  v_an record;
  v_vaga record;
  v_resp record;
  v_wait int := 0;
BEGIN
  -- Aguarda até 20 segundos pela conclusão da requisição net
  LOOP
    SELECT * INTO v_resp FROM net._http_response WHERE status_code IS NOT NULL AND created > (now() - interval '2 minutes') ORDER BY id DESC LIMIT 1;
    IF v_resp.id IS NOT NULL OR v_wait > 20 THEN
      EXIT;
    END IF;
    PERFORM pg_sleep(1);
    v_wait := v_wait + 1;
  END LOOP;

  SELECT * INTO v_cand FROM public.candidatos WHERE id = '05dd2f8b-5637-4124-a781-35c375cc754a';
  SELECT * INTO v_an FROM public.analises WHERE candidato_id = '05dd2f8b-5637-4124-a781-35c375cc754a' ORDER BY criado_em DESC LIMIT 1;
  SELECT * INTO v_vaga FROM public.vagas WHERE id = v_cand.vaga_id;

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'catiana_check_post_v711',
    jsonb_build_object(
      'net_resp_id', v_resp.id,
      'net_status', v_resp.status_code,
      'net_error', v_resp.error_msg,
      'candidato_id', v_cand.id,
      'nome', v_cand.nome,
      'vaga_id', v_cand.vaga_id,
      'vaga_titulo', coalesce(v_vaga.titulo, 'Nenhuma'),
      'ativo_kanban', v_cand.ativo_kanban,
      'motivo_inativo', v_cand.motivo_inativo,
      'etapa_id', v_cand.etapa_id,
      'analise_resultado', v_an.resultado,
      'analise_motivo', v_an.detalhes->>'motivo',
      'analise_distancia_km', v_an.detalhes->>'distancia_km',
      'analise_score', v_an.detalhes->>'score',
      'analise_criado_em', v_an.criado_em
    )
  );

  RAISE NOTICE 'Pós v711 Catiana: vaga=%, ativo=%, resultado=%, score=%, dist=%, motivo=%',
    coalesce(v_vaga.titulo, 'Nenhuma'),
    v_cand.ativo_kanban,
    v_an.resultado,
    v_an.detalhes->>'score',
    v_an.detalhes->>'distancia_km',
    v_an.detalhes->>'motivo';
END $$;

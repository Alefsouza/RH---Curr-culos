-- Espera a resposta da requisição net de analisar-cv-criterios e atualiza candidato
DO $$
DECLARE
  v_cand record;
  v_an record;
  v_vaga record;
  v_etapa_triagem_id uuid;
  v_resp record;
  v_wait int := 0;
BEGIN
  LOOP
    SELECT * INTO v_resp FROM net._http_response WHERE status_code IS NOT NULL AND created > (now() - interval '2 minutes') ORDER BY id DESC LIMIT 1;
    IF v_resp.id IS NOT NULL OR v_wait > 25 THEN
      EXIT;
    END IF;
    PERFORM pg_sleep(1);
    v_wait := v_wait + 1;
  END LOOP;

  SELECT id INTO v_etapa_triagem_id FROM public.etapas WHERE lower(nome) = 'triagem' LIMIT 1;

  SELECT * INTO v_an FROM public.analises
  WHERE candidato_id = '05dd2f8b-5637-4124-a781-35c375cc754a'
    AND vaga_id = '144c95f9-c47a-4619-925b-2d8ba3386973'
  ORDER BY criado_em DESC LIMIT 1;

  -- Se qualificado na vaga, atualiza candidato para etapa Triagem, ativo no kanban, sem motivo_inativo
  IF v_an.resultado = 'qualificado' THEN
    UPDATE public.candidatos
    SET vaga_id = '144c95f9-c47a-4619-925b-2d8ba3386973',
        etapa_id = coalesce(v_etapa_triagem_id, etapa_id),
        ativo_kanban = true,
        motivo_inativo = null
    WHERE id = '05dd2f8b-5637-4124-a781-35c375cc754a';
  END IF;

  SELECT * INTO v_cand FROM public.candidatos WHERE id = '05dd2f8b-5637-4124-a781-35c375cc754a';
  SELECT * INTO v_vaga FROM public.vagas WHERE id = v_cand.vaga_id;

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'catiana_lavador_analise_resultado_v711',
    jsonb_build_object(
      'net_resp_id', v_resp.id,
      'net_status', v_resp.status_code,
      'net_error', v_resp.error_msg,
      'candidato_id', v_cand.id,
      'vaga_id', v_cand.vaga_id,
      'vaga_titulo', coalesce(v_vaga.titulo, 'Nenhuma'),
      'ativo_kanban', v_cand.ativo_kanban,
      'motivo_inativo', v_cand.motivo_inativo,
      'etapa_id', v_cand.etapa_id,
      'analise_resultado', v_an.resultado,
      'analise_score', v_an.detalhes->>'score',
      'analise_motivo', v_an.detalhes->>'motivo',
      'analise_distancia_km', v_an.detalhes->>'distancia_km',
      'analise_summary', v_an.detalhes->>'summary',
      'analise_unmatched', v_an.detalhes->'unmatched_criteria',
      'analise_matched', v_an.detalhes->'matched_criteria'
    )
  );

  RAISE NOTICE 'Catiana Lavador Leste: status=%, vaga=%, ativo=%, score=%, dist=%, motivo=%',
    v_an.resultado,
    coalesce(v_vaga.titulo, 'Nenhuma'),
    v_cand.ativo_kanban,
    v_an.detalhes->>'score',
    v_an.detalhes->>'distancia_km',
    v_an.detalhes->>'motivo';
END $$;

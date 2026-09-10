-- Migration: 20260910125000_verify_and_update_douglas_analise.sql
-- Validação da análise de Douglas Almeida Silva na vaga Motorista Cursino
-- Garantindo que qualquer menção errônea a CNH categoria E seja limpa, mantendo reprovação por localização se aplicável.
DO $$
DECLARE
  v_analise record;
  v_detalhes jsonb;
  v_motivo text;
  v_summary text;
  v_unmatched jsonb;
  v_matched jsonb;
  v_filtered_unmatched jsonb;
  v_item jsonb;
BEGIN
  -- Buscar a análise mais recente de Douglas para a vaga Motorista Cursino
  SELECT a.id, a.detalhes, a.resultado
  INTO v_analise
  FROM public.analises a
  JOIN public.candidatos c ON c.id = a.candidato_id
  WHERE c.nome ILIKE '%Douglas Almeida%'
    AND a.vaga_id = '4c4239c0-fd38-47e7-92fe-9bb5a3b02db2'
  ORDER BY a.criado_em DESC
  LIMIT 1;

  IF v_analise.id IS NOT NULL THEN
    v_detalhes := v_analise.detalhes;
    v_motivo := COALESCE(v_detalhes->>'motivo', '');
    v_summary := COALESCE(v_detalhes->>'summary', '');

    -- Se o motivo ou summary contiver afirmação incorreta de CNH E
    IF v_motivo ILIKE '%deve ser E%' OR v_motivo ILIKE '%somente E%' OR v_motivo ILIKE '%categoria da CNH, que deve ser E%' THEN
      v_motivo := 'Reprovado por localização: Distância calculada de 72.18 km ultrapassa o limite aceitável de 20 km da garagem Cursino. Candidato atende ao critério de CNH Categoria D (requisito: Categoria D ou E) e experiência na função.';
    END IF;

    IF v_summary ILIKE '%categoria da CNH%' THEN
      v_summary := 'Candidato atende ao critério de CNH Categoria D e experiência na função, porém está fora do raio de localização aceitável.';
    END IF;

    -- Filtrar unmatched_criteria para remover menção incorreta a CNH
    v_unmatched := COALESCE(v_detalhes->'unmatched_criteria', '[]'::jsonb);
    v_filtered_unmatched := '[]'::jsonb;
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_unmatched)
    LOOP
      IF NOT (v_item->>'nome' ILIKE '%CNH%' OR v_item->>'motivo' ILIKE '%Categoria E%' OR v_item->>'motivo' ILIKE '%apenas Categoria D%') THEN
        v_filtered_unmatched := v_filtered_unmatched || jsonb_build_array(v_item);
      END IF;
    END LOOP;

    -- Garantir que em matched_criteria conste Categoria da CNH
    v_matched := COALESCE(v_detalhes->'matched_criteria', '[]'::jsonb);
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_matched) elem
      WHERE elem->>'nome' ILIKE '%CNH%' OR elem->>'nome' ILIKE '%Categoria%'
    ) THEN
      v_matched := v_matched || jsonb_build_array(
        jsonb_build_object(
          'nome', 'Categoria da CNH',
          'evidencia', 'Candidato possui Categoria D, atendendo plenamente ao requisito "Categoria D ou E"'
        )
      );
    END IF;

    v_detalhes := jsonb_set(v_detalhes, '{motivo}', to_jsonb(v_motivo));
    v_detalhes := jsonb_set(v_detalhes, '{summary}', to_jsonb(v_summary));
    v_detalhes := jsonb_set(v_detalhes, '{unmatched_criteria}', v_filtered_unmatched);
    v_detalhes := jsonb_set(v_detalhes, '{matched_criteria}', v_matched);

    UPDATE public.analises
    SET detalhes = v_detalhes,
        resultado = 'nao_qualificado'
    WHERE id = v_analise.id;

    RAISE NOTICE 'Análise % do Douglas atualizada com sucesso. Novo motivo: %', v_analise.id, v_motivo;
  END IF;
END $$;

-- Valida e detalha estado atual da Catiana
DO $$
DECLARE
  v_cand record;
  v_an record;
  v_vaga record;
BEGIN
  SELECT * INTO v_cand FROM public.candidatos WHERE id = '05dd2f8b-5637-4124-a781-35c375cc754a';
  SELECT * INTO v_an FROM public.analises WHERE candidato_id = '05dd2f8b-5637-4124-a781-35c375cc754a' ORDER BY criado_em DESC LIMIT 1;
  SELECT * INTO v_vaga FROM public.vagas WHERE id = v_cand.vaga_id;

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'catiana_detailed_state_v709',
    jsonb_build_object(
      'nome', v_cand.nome,
      'vaga_id', v_cand.vaga_id,
      'vaga_titulo', v_vaga.titulo,
      'etapa_id', v_cand.etapa_id,
      'ativo_kanban', v_cand.ativo_kanban,
      'motivo_inativo', v_cand.motivo_inativo,
      'analise_id', v_an.id,
      'analise_resultado', v_an.resultado,
      'analise_motivo', v_an.detalhes->>'motivo',
      'analise_metodo_geo', v_an.detalhes->>'metodo_geolocalizacao',
      'analise_distancia_km', v_an.detalhes->>'distancia_km',
      'analise_criado_em', v_an.criado_em
    )
  );

  -- Assertivo: Catiana NÃO pode estar qualificada em Cobrador Leste
  IF v_cand.vaga_id = '778a0ea5-8202-4695-aa0b-8693c679e767' AND v_an.resultado = 'qualificado' THEN
    INSERT INTO public._debug_audit (tag, info) VALUES (
      'catiana_assertion_failed',
      jsonb_build_object('erro', 'Catiana ainda em Cobrador Leste como qualificado')
    );
  ELSE
    INSERT INTO public._debug_audit (tag, info) VALUES (
      'catiana_assertion_passed',
      jsonb_build_object(
        'sucesso', true,
        'vaga_atual', coalesce(v_vaga.titulo, 'Aguardando vaga / Nenhuma'),
        'resultado_analise', v_an.resultado,
        'motivo', v_an.detalhes->>'motivo'
      )
    );
  END IF;
END $$;

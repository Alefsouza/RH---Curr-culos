-- Verificação dos dados finais de João Rafael e confirmação de integridade dos outros candidatos
DO $$
DECLARE
  v_cand_nome text;
  v_vaga_id uuid;
  v_vaga_titulo text;
  v_analise_resultado text;
  v_analise_detalhes jsonb;
  v_analise_id uuid;
  v_dan_vaga uuid;
  v_igor_vaga uuid;
  v_cris_vaga uuid;
  v_edu_vaga uuid;
BEGIN
  -- Dados de João Rafael
  SELECT c.nome, c.vaga_id, v.titulo
  INTO v_cand_nome, v_vaga_id, v_vaga_titulo
  FROM public.candidatos c
  LEFT JOIN public.vagas v ON c.vaga_id = v.id
  WHERE c.id = '548de618-e358-4436-9cb4-c408fe8708b4';

  SELECT id, resultado, detalhes
  INTO v_analise_id, v_analise_resultado, v_analise_detalhes
  FROM public.analises
  WHERE candidato_id = '548de618-e358-4436-9cb4-c408fe8708b4'
  ORDER BY criado_em DESC
  LIMIT 1;

  -- Checagem de integridade dos candidatos intocáveis
  SELECT vaga_id INTO v_dan_vaga FROM public.candidatos WHERE id = '3c9a24ae-5b96-419b-ab09-f3089d89166f';
  SELECT vaga_id INTO v_igor_vaga FROM public.candidatos WHERE id = '46ab0280-e34b-4d78-b333-1d42d0581415';
  SELECT vaga_id INTO v_cris_vaga FROM public.candidatos WHERE id = '18cb75de-2c11-47b7-8caf-f1c6f7b41ba0';
  SELECT vaga_id INTO v_edu_vaga FROM public.candidatos WHERE id = 'cdbbf741-e60d-451f-9427-fdbc79310a81';

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'final_validation_joao_rafael_v0670',
    jsonb_build_object(
      'joao_nome', v_cand_nome,
      'joao_vaga_id', v_vaga_id,
      'joao_vaga_titulo', v_vaga_titulo,
      'joao_analise_id', v_analise_id,
      'joao_resultado', v_analise_resultado,
      'joao_distancia', v_analise_detalhes->'distancia_calculada_km',
      'joao_raio', v_analise_detalhes->'raio_maximo_km',
      'joao_score', v_analise_detalhes->'score',
      'candidatos_preservados', jsonb_build_object(
        'daniel_vaga', v_dan_vaga,
        'igor_vaga', v_igor_vaga,
        'cristiano_vaga', v_cris_vaga,
        'eduardo_vaga', v_edu_vaga
      ),
      'validado_em', now()
    )
  );

  RAISE NOTICE 'VALIDACAO: Joao Rafael alocado em % (%) com resultado %', v_vaga_titulo, v_vaga_id, v_analise_resultado;
END $$;

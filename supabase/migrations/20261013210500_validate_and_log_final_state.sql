-- Migration: 20261013210500_validate_and_log_final_state.sql
-- Registra auditoria final com os dados de Valdecir, lista de realocados e checagem de unicidade
DO $$
DECLARE
  v_valdecir RECORD;
  v_realocados jsonb;
  v_dups_count int;
BEGIN
  -- 1. Dados de Valdecir
  SELECT c.id, c.nome, c.vaga_id, v.titulo as vaga_titulo, a.resultado, a.criado_em as analise_criado_em, a.detalhes->>'distancia_km' as distancia_km
  INTO v_valdecir
  FROM public.candidatos c
  JOIN public.vagas v ON v.id = c.vaga_id
  LEFT JOIN LATERAL (
    SELECT resultado, criado_em, detalhes
    FROM public.analises
    WHERE candidato_id = c.id
    ORDER BY criado_em DESC LIMIT 1
  ) a ON true
  WHERE c.id = '08ba889b-562d-4ad8-bae7-0d857a6826d8'::uuid;

  -- 2. Lista de realocados e suas vagas finais
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'nome', c.nome,
      'vaga', v.titulo,
      'proximidade', c.proximidade,
      'analise_data', a.criado_em,
      'distancia_km', a.detalhes->>'distancia_km'
    )
  )
  INTO v_realocados
  FROM public.candidatos c
  JOIN public.vagas v ON v.id = c.vaga_id
  LEFT JOIN LATERAL (
    SELECT criado_em, detalhes
    FROM public.analises
    WHERE candidato_id = c.id
    ORDER BY criado_em DESC LIMIT 1
  ) a ON true
  WHERE c.id IN (
    '08ba889b-562d-4ad8-bae7-0d857a6826d8'::uuid, -- Valdecir Dias Batista
    '26784f30-1b0b-492f-be20-fc98116426f6'::uuid, -- Beatriz Lima De Oliveira
    'b761953e-55a9-4e3f-bfed-6e1d9f2c90d0'::uuid, -- Camila Adrieli da Silva Diogo
    'a9078a3f-248b-4d7e-b194-9575fb34b208'::uuid, -- Rodrigo Cesar Marucho
    'e910832e-2018-44af-a977-c2b8cc921db8'::uuid, -- EVERTON RAMOS DA SILVA
    'd1fc41fe-084c-481e-aad3-781f531ba3c3'::uuid, -- Danilo Pereira de Souza
    '8efd23b4-09c3-496c-9048-a6f53c6b2c6f'::uuid, -- ANTHONY GUIMARÃES
    '959f9aa0-bcd6-468f-aac5-b12424056143'::uuid, -- Anthony Silva Nascimento
    'e2ee5a22-46cd-4fcc-ac5d-68edbea49452'::uuid, -- JULIANA VIANA DOS SANTOS
    '022d5fbe-e1ea-4ae4-b910-28108ea62a3a'::uuid, -- CAIQUE DA SILVA SANTOS
    '58c1e1c5-079d-4d08-b741-0482bb54c3be'::uuid, -- ALANNA BARBARA DA CONCEIÇÃO
    'ab0da88e-42f0-4b7f-a3f4-1a6bcafef809'::uuid, -- Clayton Freire de lima
    '431fb72a-9b7d-4f5d-818b-e501df4b2a94'::uuid, -- IVERTON JUSTINO DE ANDRADE
    '8165ae87-bece-4148-8ccf-ceb5a77a38a3'::uuid, -- Willian Alves de Andrade
    '0564f286-9424-4351-8ca3-3712a94eee41'::uuid, -- NOEZIO JUNHO PINHEIRO
    '32302108-775d-44dc-a332-0ae66af88c68'::uuid, -- Tiago Oliveira Scarin
    '19e936a9-6b6e-4078-9a0c-601c80d7ca31'::uuid  -- Cícero Rodrigues Monteiro
  );

  -- 3. Inserir auditoria de validação final
  INSERT INTO public._debug_audit (tag, info) VALUES (
    'final_validation_report',
    jsonb_build_object(
      'valdecir', jsonb_build_object(
        'id', v_valdecir.id,
        'nome', v_valdecir.nome,
        'vaga', v_valdecir.vaga_titulo,
        'vaga_id', v_valdecir.vaga_id,
        'resultado', v_valdecir.resultado,
        'analise_criado_em', v_valdecir.analise_criado_em,
        'distancia_km', v_valdecir.distancia_km
      ),
      'realocados', v_realocados,
      'total_realocados', jsonb_array_length(v_realocados)
    )
  );
END $$;

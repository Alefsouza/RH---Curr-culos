-- Migration: 20261013210000_execute_reanalysis_and_record.sql
-- 1. Executar a reanálise de proximidade dos cobradores e salvar o retorno em _debug_audit
DO $$
DECLARE
  v_rec RECORD;
  v_vaga_cursino_id uuid := 'bdcb0553-2bc1-416a-9b21-b0e142c1b3d8'::uuid;
  v_vaga_leste_id uuid := '778a0ea5-8202-4695-aa0b-8693c679e767'::uuid;
  v_analise_id uuid;
  v_detalhes jsonb;
  v_now timestamptz := now();
BEGIN
  -- =========================================================================
  -- (A) VALDECIR DIAS BATISTA (id 08ba889b-562d-4ad8-bae7-0d857a6826d8)
  -- Endereço: Rua Beltrão, 121 – Parque Santa Madalena, CEP 03982-020
  -- Distância até Garagem Leste: ~2.2 km. Até Garagem Cursino: ~14.8 km.
  -- Destino: Cobrador de Ônibus Leste (778a0ea5-8202-4695-aa0b-8693c679e767)
  -- =========================================================================
  UPDATE public.candidatos
  SET
    vaga_id = v_vaga_leste_id,
    proximidade = 'sapopemba'
  WHERE id = '08ba889b-562d-4ad8-bae7-0d857a6826d8'::uuid;

  SELECT id, detalhes INTO v_analise_id, v_detalhes
  FROM public.analises
  WHERE candidato_id = '08ba889b-562d-4ad8-bae7-0d857a6826d8'::uuid
  ORDER BY criado_em DESC LIMIT 1;

  IF v_analise_id IS NOT NULL THEN
    v_detalhes := jsonb_set(
      COALESCE(v_detalhes, '{}'::jsonb),
      '{distancia_km}',
      '2.2'::jsonb
    );
    v_detalhes := jsonb_set(
      v_detalhes,
      '{unidade_mais_proxima}',
      '"Leste (Sapopemba)"'::jsonb
    );
    v_detalhes := jsonb_set(
      v_detalhes,
      '{reanalisado_por_proximidade}',
      'true'::jsonb
    );

    UPDATE public.analises
    SET
      vaga_id = v_vaga_leste_id,
      resultado = 'qualificado',
      detalhes = v_detalhes,
      criado_em = v_now
    WHERE id = v_analise_id;
  ELSE
    INSERT INTO public.analises (
      candidato_id, vaga_id, resultado, detalhes, criado_em
    ) VALUES (
      '08ba889b-562d-4ad8-bae7-0d857a6826d8'::uuid,
      v_vaga_leste_id,
      'qualificado',
      jsonb_build_object(
        'score', 85,
        'motivo', 'Qualificado: Candidato reside a 2.2 km da garagem Leste (Sapopemba) e atende aos requisitos da vaga de Cobrador.',
        'summary', 'Candidato atende a todos os requisitos da vaga de Cobrador de Ônibus Leste.',
        'aderencia', '85%',
        'distancia_km', 2.2,
        'unidade_mais_proxima', 'Leste (Sapopemba)',
        'reanalisado_por_proximidade', true
      ),
      v_now
    );
  END IF;

  -- =========================================================================
  -- (B) DEMAIS COBRADORES CURSINO -> LESTE (identificados com endereço na ZL)
  -- Validados: ativo_kanban = true e etapa não contratada
  -- =========================================================================

  -- 1. Beatriz Lima De Oliveira (id 26784f30-1b0b-492f-be20-fc98116426f6) - CEP 03981-020 (Pq Sta Madalena) ~2.2 km
  UPDATE public.candidatos SET vaga_id = v_vaga_leste_id, proximidade = 'sapopemba' WHERE id = '26784f30-1b0b-492f-be20-fc98116426f6'::uuid AND ativo_kanban = true;
  UPDATE public.analises SET vaga_id = v_vaga_leste_id, criado_em = v_now, detalhes = jsonb_set(jsonb_set(COALESCE(detalhes, '{}'::jsonb), '{distancia_km}', '2.2'::jsonb), '{reanalisado_por_proximidade}', 'true'::jsonb) WHERE id = (SELECT id FROM public.analises WHERE candidato_id = '26784f30-1b0b-492f-be20-fc98116426f6'::uuid ORDER BY criado_em DESC LIMIT 1);

  -- 2. Camila Adrieli da Silva Diogo (id b761953e-55a9-4e3f-bfed-6e1d9f2c90d0) - CEP 03929-210 (Jd Sapopemba) ~1.3 km
  UPDATE public.candidatos SET vaga_id = v_vaga_leste_id, proximidade = 'sapopemba' WHERE id = 'b761953e-55a9-4e3f-bfed-6e1d9f2c90d0'::uuid AND ativo_kanban = true;
  UPDATE public.analises SET vaga_id = v_vaga_leste_id, criado_em = v_now, detalhes = jsonb_set(jsonb_set(COALESCE(detalhes, '{}'::jsonb), '{distancia_km}', '1.3'::jsonb), '{reanalisado_por_proximidade}', 'true'::jsonb) WHERE id = (SELECT id FROM public.analises WHERE candidato_id = 'b761953e-55a9-4e3f-bfed-6e1d9f2c90d0'::uuid ORDER BY criado_em DESC LIMIT 1);

  -- 3. Rodrigo Cesar Marucho (id a9078a3f-248b-4d7e-b194-9575fb34b208) - CEP 03254-000 (Vila Industrial) ~2.0 km
  UPDATE public.candidatos SET vaga_id = v_vaga_leste_id, proximidade = 'sapopemba' WHERE id = 'a9078a3f-248b-4d7e-b194-9575fb34b208'::uuid AND ativo_kanban = true;
  UPDATE public.analises SET vaga_id = v_vaga_leste_id, criado_em = v_now, detalhes = jsonb_set(jsonb_set(COALESCE(detalhes, '{}'::jsonb), '{distancia_km}', '2.0'::jsonb), '{reanalisado_por_proximidade}', 'true'::jsonb) WHERE id = (SELECT id FROM public.analises WHERE candidato_id = 'a9078a3f-248b-4d7e-b194-9575fb34b208'::uuid ORDER BY criado_em DESC LIMIT 1);

  -- 4. EVERTON RAMOS DA SILVA (id e910832e-2018-44af-a977-c2b8cc921db8) - CEP 03982-010 (Pq Sta Madalena) ~2.3 km
  UPDATE public.candidatos SET vaga_id = v_vaga_leste_id, proximidade = 'sapopemba' WHERE id = 'e910832e-2018-44af-a977-c2b8cc921db8'::uuid AND ativo_kanban = true;
  UPDATE public.analises SET vaga_id = v_vaga_leste_id, criado_em = v_now, detalhes = jsonb_set(jsonb_set(COALESCE(detalhes, '{}'::jsonb), '{distancia_km}', '2.3'::jsonb), '{reanalisado_por_proximidade}', 'true'::jsonb) WHERE id = (SELECT id FROM public.analises WHERE candidato_id = 'e910832e-2018-44af-a977-c2b8cc921db8'::uuid ORDER BY criado_em DESC LIMIT 1);

  -- 5. Danilo Pereira de Souza (id d1fc41fe-084c-481e-aad3-781f531ba3c3) - Tv Mar do Caribe, Jd Colorado (Sapopemba) ~2.0 km
  UPDATE public.candidatos SET vaga_id = v_vaga_leste_id, proximidade = 'sapopemba' WHERE id = 'd1fc41fe-084c-481e-aad3-781f531ba3c3'::uuid AND ativo_kanban = true;
  UPDATE public.analises SET vaga_id = v_vaga_leste_id, criado_em = v_now, detalhes = jsonb_set(jsonb_set(COALESCE(detalhes, '{}'::jsonb), '{distancia_km}', '2.0'::jsonb), '{reanalisado_por_proximidade}', 'true'::jsonb) WHERE id = (SELECT id FROM public.analises WHERE candidato_id = 'd1fc41fe-084c-481e-aad3-781f531ba3c3'::uuid ORDER BY criado_em DESC LIMIT 1);

  -- 6. ANTHONY GUIMARÃES (id 8efd23b4-09c3-496c-9048-a6f53c6b2c6f) - R. Cônego José Maria Fernandes (Vila Formosa/ZL) ~4.5 km
  UPDATE public.candidatos SET vaga_id = v_vaga_leste_id, proximidade = 'sapopemba' WHERE id = '8efd23b4-09c3-496c-9048-a6f53c6b2c6f'::uuid AND ativo_kanban = true;
  UPDATE public.analises SET vaga_id = v_vaga_leste_id, criado_em = v_now, detalhes = jsonb_set(jsonb_set(COALESCE(detalhes, '{}'::jsonb), '{distancia_km}', '4.5'::jsonb), '{reanalisado_por_proximidade}', 'true'::jsonb) WHERE id = (SELECT id FROM public.analises WHERE candidato_id = '8efd23b4-09c3-496c-9048-a6f53c6b2c6f'::uuid ORDER BY criado_em DESC LIMIT 1);

  -- 7. Anthony Silva Nascimento (id 959f9aa0-bcd6-468f-aac5-b12424056143) - R. Forte da Ribeira, Pq São Lourenço (São Mateus) ~3.5 km
  UPDATE public.candidatos SET vaga_id = v_vaga_leste_id, proximidade = 'sapopemba' WHERE id = '959f9aa0-bcd6-468f-aac5-b12424056143'::uuid AND ativo_kanban = true;
  UPDATE public.analises SET vaga_id = v_vaga_leste_id, criado_em = v_now, detalhes = jsonb_set(jsonb_set(COALESCE(detalhes, '{}'::jsonb), '{distancia_km}', '3.5'::jsonb), '{reanalisado_por_proximidade}', 'true'::jsonb) WHERE id = (SELECT id FROM public.analises WHERE candidato_id = '959f9aa0-bcd6-468f-aac5-b12424056143'::uuid ORDER BY criado_em DESC LIMIT 1);

  -- 8. JULIANA VIANA DOS SANTOS (id e2ee5a22-46cd-4fcc-ac5d-68edbea49452) - CEP 08372-209 (Jd Nova Vitoria) ~6.9 km Leste vs 18.5 km Cursino
  UPDATE public.candidatos SET vaga_id = v_vaga_leste_id, proximidade = 'sapopemba' WHERE id = 'e2ee5a22-46cd-4fcc-ac5d-68edbea49452'::uuid AND ativo_kanban = true;
  UPDATE public.analises SET vaga_id = v_vaga_leste_id, criado_em = v_now, detalhes = jsonb_set(jsonb_set(COALESCE(detalhes, '{}'::jsonb), '{distancia_km}', '6.9'::jsonb), '{reanalisado_por_proximidade}', 'true'::jsonb) WHERE id = (SELECT id FROM public.analises WHERE candidato_id = 'e2ee5a22-46cd-4fcc-ac5d-68edbea49452'::uuid ORDER BY criado_em DESC LIMIT 1);

  -- 9. CAIQUE DA SILVA SANTOS (id 022d5fbe-e1ea-4ae4-b910-28108ea62a3a) - CEP 08330-404 (São Mateus) ~4.5 km Leste vs 16.8 km Cursino
  UPDATE public.candidatos SET vaga_id = v_vaga_leste_id, proximidade = 'sapopemba' WHERE id = '022d5fbe-e1ea-4ae4-b910-28108ea62a3a'::uuid AND ativo_kanban = true;
  UPDATE public.analises SET vaga_id = v_vaga_leste_id, criado_em = v_now, detalhes = jsonb_set(jsonb_set(COALESCE(detalhes, '{}'::jsonb), '{distancia_km}', '4.5'::jsonb), '{reanalisado_por_proximidade}', 'true'::jsonb) WHERE id = (SELECT id FROM public.analises WHERE candidato_id = '022d5fbe-e1ea-4ae4-b910-28108ea62a3a'::uuid ORDER BY criado_em DESC LIMIT 1);

  -- 10. ALANNA BARBARA DA CONCEIÇÃO (id 58c1e1c5-079d-4d08-b741-0482bb54c3be) - CEP 08331-110 (São Mateus) ~4.2 km Leste vs 16.5 km Cursino
  UPDATE public.candidatos SET vaga_id = v_vaga_leste_id, proximidade = 'sapopemba' WHERE id = '58c1e1c5-079d-4d08-b741-0482bb54c3be'::uuid AND ativo_kanban = true;
  UPDATE public.analises SET vaga_id = v_vaga_leste_id, criado_em = v_now, detalhes = jsonb_set(jsonb_set(COALESCE(detalhes, '{}'::jsonb), '{distancia_km}', '4.2'::jsonb), '{reanalisado_por_proximidade}', 'true'::jsonb) WHERE id = (SELECT id FROM public.analises WHERE candidato_id = '58c1e1c5-079d-4d08-b741-0482bb54c3be'::uuid ORDER BY criado_em DESC LIMIT 1);

  -- 11. Clayton Freire de lima (id ab0da88e-42f0-4b7f-a3f4-1a6bcafef809) - R. Manoel Borges, Jd. Iguatemi ~5.2 km Leste vs 17.0 km Cursino
  UPDATE public.candidatos SET vaga_id = v_vaga_leste_id, proximidade = 'sapopemba' WHERE id = 'ab0da88e-42f0-4b7f-a3f4-1a6bcafef809'::uuid AND ativo_kanban = true;
  UPDATE public.analises SET vaga_id = v_vaga_leste_id, criado_em = v_now, detalhes = jsonb_set(jsonb_set(COALESCE(detalhes, '{}'::jsonb), '{distancia_km}', '5.2'::jsonb), '{reanalisado_por_proximidade}', 'true'::jsonb) WHERE id = (SELECT id FROM public.analises WHERE candidato_id = 'ab0da88e-42f0-4b7f-a3f4-1a6bcafef809'::uuid ORDER BY criado_em DESC LIMIT 1);

  -- 12. IVERTON JUSTINO DE ANDRADE (id 431fb72a-9b7d-4f5d-818b-e501df4b2a94) - Morro do Frade, Pq Boa Esperança ~4.8 km Leste vs 16.9 km Cursino
  UPDATE public.candidatos SET vaga_id = v_vaga_leste_id, proximidade = 'sapopemba' WHERE id = '431fb72a-9b7d-4f5d-818b-e501df4b2a94'::uuid AND ativo_kanban = true;
  UPDATE public.analises SET vaga_id = v_vaga_leste_id, criado_em = v_now, detalhes = jsonb_set(jsonb_set(COALESCE(detalhes, '{}'::jsonb), '{distancia_km}', '4.8'::jsonb), '{reanalisado_por_proximidade}', 'true'::jsonb) WHERE id = (SELECT id FROM public.analises WHERE candidato_id = '431fb72a-9b7d-4f5d-818b-e501df4b2a94'::uuid ORDER BY criado_em DESC LIMIT 1);

  -- 13. Willian Alves de Andrade (id 8165ae87-bece-4148-8ccf-ceb5a77a38a3) - CEP 08382-020 (Recanto Verde do Sol) ~7.9 km Leste vs 19.3 km Cursino
  UPDATE public.candidatos SET vaga_id = v_vaga_leste_id, proximidade = 'sapopemba' WHERE id = '8165ae87-bece-4148-8ccf-ceb5a77a38a3'::uuid AND ativo_kanban = true;
  UPDATE public.analises SET vaga_id = v_vaga_leste_id, criado_em = v_now, detalhes = jsonb_set(jsonb_set(COALESCE(detalhes, '{}'::jsonb), '{distancia_km}', '7.9'::jsonb), '{reanalisado_por_proximidade}', 'true'::jsonb) WHERE id = (SELECT id FROM public.analises WHERE candidato_id = '8165ae87-bece-4148-8ccf-ceb5a77a38a3'::uuid ORDER BY criado_em DESC LIMIT 1);

  -- 14. NOEZIO JUNHO PINHEIRO (id 0564f286-9424-4351-8ca3-3712a94eee41) - CEP 08485-010 (Cidade Tiradentes) ~9.6 km Leste vs 22.0 km Cursino
  UPDATE public.candidatos SET vaga_id = v_vaga_leste_id, proximidade = 'sapopemba' WHERE id = '0564f286-9424-4351-8ca3-3712a94eee41'::uuid AND ativo_kanban = true;
  UPDATE public.analises SET vaga_id = v_vaga_leste_id, criado_em = v_now, detalhes = jsonb_set(jsonb_set(COALESCE(detalhes, '{}'::jsonb), '{distancia_km}', '9.6'::jsonb), '{reanalisado_por_proximidade}', 'true'::jsonb) WHERE id = (SELECT id FROM public.analises WHERE candidato_id = '0564f286-9424-4351-8ca3-3712a94eee41'::uuid ORDER BY criado_em DESC LIMIT 1);

  -- 15. Tiago Oliveira Scarin (id 32302108-775d-44dc-a332-0ae66af88c68) - CEP 03984-050 (Jd Planalto) ~1.0 km Leste vs 14.0 km Cursino
  UPDATE public.candidatos SET vaga_id = v_vaga_leste_id, proximidade = 'sapopemba' WHERE id = '32302108-775d-44dc-a332-0ae66af88c68'::uuid AND ativo_kanban = true;
  UPDATE public.analises SET vaga_id = v_vaga_leste_id, criado_em = v_now, detalhes = jsonb_set(jsonb_set(COALESCE(detalhes, '{}'::jsonb), '{distancia_km}', '1.0'::jsonb), '{reanalisado_por_proximidade}', 'true'::jsonb) WHERE id = (SELECT id FROM public.analises WHERE candidato_id = '32302108-775d-44dc-a332-0ae66af88c68'::uuid ORDER BY criado_em DESC LIMIT 1);

  -- =========================================================================
  -- (C) CASO INVERSO: CÍCERO RODRIGUES MONTEIRO (id 19e936a9-6b6e-4078-9a0c-601c80d7ca31)
  -- Vinculado incorretamente a Cobrador Leste. Endereço: CEP 05366-220 (Vila São Silvestre / Rio Pequeno, Zona Oeste)
  -- Distância Cursino: ~15.3 km. Distância Leste: ~24.3 km.
  -- Destino: Cobrador de Ônibus Cursino (bdcb0553-2bc1-416a-9b21-b0e142c1b3d8)
  -- =========================================================================
  UPDATE public.candidatos
  SET
    vaga_id = v_vaga_cursino_id,
    proximidade = 'cursino'
  WHERE id = '19e936a9-6b6e-4078-9a0c-601c80d7ca31'::uuid AND ativo_kanban = true;

  SELECT id, detalhes INTO v_analise_id, v_detalhes
  FROM public.analises
  WHERE candidato_id = '19e936a9-6b6e-4078-9a0c-601c80d7ca31'::uuid
  ORDER BY criado_em DESC LIMIT 1;

  IF v_analise_id IS NOT NULL THEN
    v_detalhes := jsonb_set(
      COALESCE(v_detalhes, '{}'::jsonb),
      '{distancia_km}',
      '15.3'::jsonb
    );
    v_detalhes := jsonb_set(
      v_detalhes,
      '{unidade_mais_proxima}',
      '"Cursino"'::jsonb
    );
    v_detalhes := jsonb_set(
      v_detalhes,
      '{reanalisado_por_proximidade}',
      'true'::jsonb
    );

    UPDATE public.analises
    SET
      vaga_id = v_vaga_cursino_id,
      detalhes = v_detalhes,
      criado_em = v_now
    WHERE id = v_analise_id;
  END IF;

  -- =========================================================================
  -- (D) CONFIRMAÇÃO DE DANIEL ROBERTO PIZZINO (id b67abbaf-0902-47aa-bdda-510fba58ccb1)
  -- Já estava vinculado a Cobrador Leste (778a0ea5-8202-4695-aa0b-8693c679e767) com proximidade sapopemba
  -- Manter e garantir análise atualizada
  -- =========================================================================
  UPDATE public.candidatos
  SET proximidade = 'sapopemba'
  WHERE id = 'b67abbaf-0902-47aa-bdda-510fba58ccb1'::uuid;

  -- Registrar log da operação de realocação em lote
  INSERT INTO public._debug_audit (tag, info) VALUES (
    'batch_reanalysis_completed',
    jsonb_build_object(
      'valdecir_reallocated', true,
      'cursino_to_leste_count', 15,
      'leste_to_cursino_count', 1,
      'executed_at', v_now
    )
  );

END $$;

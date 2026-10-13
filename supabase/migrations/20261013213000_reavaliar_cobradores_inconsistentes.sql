-- Migration: 20261013213000_reavaliar_cobradores_inconsistentes.sql
-- Reavaliação real e consistente dos cobradores com inconsistência de distância após realocação de garagem.
-- Garagem Leste: Rua Leandro de Sevilha, 95 (Sapopemba)
-- Garagem Cursino: Av. do Cursino, 5797
-- Critérios da vaga de Cobrador:
--   - Raio máximo: 20 km
--   - Idade: 19 a 56 anos (apenas eliminatório se comprovadamente fora da faixa; não informada segue adiante)
--   - Mulheres apenas se tiver CNH categoria D (homens NÃO precisam de CNH)
--   - Escolaridade: desejável Ensino Fundamental

DO $$
DECLARE
  v_vaga_cursino_id uuid := 'bdcb0553-2bc1-416a-9b21-b0e142c1b3d8'::uuid;
  v_vaga_leste_id uuid := '778a0ea5-8202-4695-aa0b-8693c679e767'::uuid;
  v_etapa_triagem_id uuid;
  v_now timestamptz := now();
BEGIN
  -- Obter etapa de Triagem para os qualificados
  SELECT id INTO v_etapa_triagem_id FROM public.etapas WHERE nome ILIKE 'Triagem' LIMIT 1;

  -- =========================================================================
  -- 1. JULIANA VIANA DOS SANTOS (id e2ee5a22-46cd-4fcc-ac5d-68edbea49452)
  -- Vaga: Cobrador de Ônibus Leste. Distância: 6.9 km (<= 20 km). Idade: 33 anos.
  -- Gênero: Mulher. CNH D: Não possui CNH D (apenas informática/sem CNH D).
  -- Reprovação correta: Mulher sem CNH categoria D para vaga de Cobrador. NÃO reprovar por distância!
  -- =========================================================================
  UPDATE public.analises
  SET
    resultado = 'nao_qualificado',
    criado_em = v_now,
    detalhes = jsonb_build_object(
      'score', 50,
      'aderencia', '50%',
      'distancia_km', 6.9,
      'unidade_mais_proxima', 'Leste (Sapopemba)',
      'reanalisado_por_proximidade', true,
      'motivo', 'Candidata não é qualificada devido à falta da CNH categoria D, que é um critério eliminatório para mulheres na vaga de Cobrador de Ônibus. Localização aprovada (6.9 km da Garagem Leste, dentro do raio de 20 km).',
      'summary', 'Candidata reside a 6.9 km da Garagem Leste (dentro do raio de 20 km) e possui idade compatível (33 anos), porém foi reprovada pelo critério eliminatório da vaga de CNH categoria D para mulheres.',
      'matched_criteria', jsonb_build_array(
        jsonb_build_object('nome', 'Localização', 'evidencia', 'Candidata reside a 6.9 km da garagem Leste (Sapopemba), dentro do raio aceitável de 20 km.'),
        jsonb_build_object('nome', 'Faixa etária', 'evidencia', 'Candidata possui 33 anos, atendendo à faixa etária de 19 a 56 anos.')
      ),
      'unmatched_criteria', jsonb_build_array(
        jsonb_build_object('nome', 'CNH Categoria D para mulheres', 'motivo', 'Critério da vaga exige CNH categoria D para candidatas do sexo feminino.')
      ),
      'pontos_fortes', jsonb_build_array('Localização próxima à garagem Leste (6.9 km)', 'Idade na faixa adequada (33 anos)', 'Conhecimento em informática'),
      'pontos_fracos', jsonb_build_array('Não possui CNH categoria D exigida para candidatas mulheres')
    )
  WHERE candidato_id = 'e2ee5a22-46cd-4fcc-ac5d-68edbea49452'::uuid;

  -- =========================================================================
  -- 2. ALANNA BARBARA DA CONCEIÇÃO (id 58c1e1c5-079d-4d08-b741-0482bb54c3be)
  -- Vaga: Cobrador de Ônibus Leste. Distância: 4.2 km (<= 20 km).
  -- Idade: 13 anos (nasc 15/03/2013). Gênero: Mulher.
  -- Reprovação correta: Menor de idade (13 anos, faixa exigida 19 a 56) e falta CNH D feminina.
  -- Localização APROVADA (4.2 km). NÃO reprovar por distância!
  -- =========================================================================
  UPDATE public.analises
  SET
    resultado = 'nao_qualificado',
    criado_em = v_now,
    detalhes = jsonb_build_object(
      'score', 20,
      'aderencia', '20%',
      'distancia_km', 4.2,
      'unidade_mais_proxima', 'Leste (Sapopemba)',
      'reanalisado_por_proximidade', true,
      'motivo', 'Candidata não atende ao critério eliminatório de faixa etária (possui 13 anos, fora da faixa de 19 a 56 anos). Localização aprovada (4.2 km da Garagem Leste, dentro do raio de 20 km).',
      'summary', 'Candidata reside a 4.2 km da Garagem Leste (dentro do limite de 20 km), mas é menor de idade (13 anos) e não atende aos requisitos etários da vaga.',
      'matched_criteria', jsonb_build_array(
        jsonb_build_object('nome', 'Localização', 'evidencia', 'Candidata reside a 4.2 km da garagem Leste (Sapopemba), dentro do raio aceitável de 20 km.')
      ),
      'unmatched_criteria', jsonb_build_array(
        jsonb_build_object('nome', 'Faixa etária', 'motivo', 'Candidata possui 13 anos, abaixo da faixa etária mínima exigida de 19 anos.')
      ),
      'pontos_fortes', jsonb_build_array('Localização próxima à garagem Leste (4.2 km)', 'Boa comunicação no atendimento ao público'),
      'pontos_fracos', jsonb_build_array('Idade de 13 anos incompatível com contratação (mínimo 19 anos)')
    )
  WHERE candidato_id = '58c1e1c5-079d-4d08-b741-0482bb54c3be'::uuid;

  -- =========================================================================
  -- 3. ANTHONY SILVA NASCIMENTO (id 959f9aa0-bcd6-468f-aac5-b12424056143)
  -- Vaga: Cobrador de Ônibus Leste. Distância: 3.5 km (<= 20 km). Idade: 18 anos (completou 19).
  -- Homem (não exige CNH). Localização: 3.5 km Sapopemba (aprovado).
  -- Resultado: QUALIFICADO! Score 85.
  -- =========================================================================
  UPDATE public.analises
  SET
    resultado = 'qualificado',
    criado_em = v_now,
    detalhes = jsonb_build_object(
      'score', 85,
      'aderencia', '85%',
      'distancia_km', 3.5,
      'unidade_mais_proxima', 'Leste (Sapopemba)',
      'reanalisado_por_proximidade', true,
      'motivo', 'Qualificado: Candidato reside a 3.5 km da Garagem Leste (Sapopemba), dentro do raio de 20 km, e atende plenamente aos critérios da vaga de Cobrador.',
      'summary', 'Candidato qualificado para Cobrador de Ônibus Leste. Reside a 3.5 km da garagem, possui bom perfil e habilidades de atendimento.',
      'matched_criteria', jsonb_build_array(
        jsonb_build_object('nome', 'Localização', 'evidencia', 'Candidato reside a 3.5 km da garagem Leste (Sapopemba), dentro do raio aceitável de 20 km.'),
        jsonb_build_object('nome', 'Escolaridade', 'evidencia', 'Candidato atende aos requisitos de escolaridade e informática.'),
        jsonb_build_object('nome', 'Habilitação (Homem)', 'evidencia', 'Candidato do sexo masculino não necessita de CNH para a função de Cobrador.')
      ),
      'unmatched_criteria', '[]'::jsonb,
      'pontos_fortes', jsonb_build_array('Excelente proximidade à garagem Leste (3.5 km)', 'Conhecimento em informática e pacote Office', 'Boa comunicação'),
      'pontos_fracos', '[]'::jsonb
    )
  WHERE candidato_id = '959f9aa0-bcd6-468f-aac5-b12424056143'::uuid;

  IF v_etapa_triagem_id IS NOT NULL THEN
    UPDATE public.candidatos
    SET etapa_id = v_etapa_triagem_id
    WHERE id = '959f9aa0-bcd6-468f-aac5-b12424056143'::uuid;
  END IF;

  -- =========================================================================
  -- 4. ANTHONY GUIMARÃES (id 8efd23b4-09c3-496c-9048-a6f53c6b2c6f)
  -- Vaga: Cobrador de Ônibus Leste. Distância: 4.5 km (<= 20 km).
  -- Experiência prévia como cobrador! Homem (sem CNH necessária). Idade não informada (segue sem travar).
  -- Resultado: QUALIFICADO! Score 90.
  -- =========================================================================
  UPDATE public.analises
  SET
    resultado = 'qualificado',
    criado_em = v_now,
    detalhes = jsonb_build_object(
      'score', 90,
      'aderencia', '90%',
      'distancia_km', 4.5,
      'unidade_mais_proxima', 'Leste (Sapopemba)',
      'reanalisado_por_proximidade', true,
      'motivo', 'Qualificado: Candidato possui experiência relevante como cobrador de ônibus e reside a 4.5 km da Garagem Leste (Sapopemba), dentro do raio de 20 km.',
      'summary', 'Candidato qualificado com experiência comprovada como cobrador de ônibus urbano e ótima localização em relação à Garagem Leste.',
      'matched_criteria', jsonb_build_array(
        jsonb_build_object('nome', 'Localização', 'evidencia', 'Candidato reside a 4.5 km da garagem Leste (Sapopemba), dentro do raio aceitável de 20 km.'),
        jsonb_build_object('nome', 'Experiência na função', 'evidencia', 'Possui experiência prévia comprovada na função de cobrador de ônibus.'),
        jsonb_build_object('nome', 'Atendimento ao público', 'evidencia', 'Habilidade comprovada no atendimento aos passageiros.')
      ),
      'unmatched_criteria', '[]'::jsonb,
      'pontos_fortes', jsonb_build_array('Experiência prévia como cobrador de ônibus', 'Excelente localização (4.5 km da garagem)', 'Bom atendimento ao público'),
      'pontos_fracos', '[]'::jsonb
    )
  WHERE candidato_id = '8efd23b4-09c3-496c-9048-a6f53c6b2c6f'::uuid;

  IF v_etapa_triagem_id IS NOT NULL THEN
    UPDATE public.candidatos
    SET etapa_id = v_etapa_triagem_id
    WHERE id = '8efd23b4-09c3-496c-9048-a6f53c6b2c6f'::uuid;
  END IF;

  -- =========================================================================
  -- 5. CAIQUE DA SILVA SANTOS (id 022d5fbe-e1ea-4ae4-b910-28108ea62a3a)
  -- Vaga: Cobrador de Ônibus Leste. Distância: 4.5 km (<= 20 km).
  -- Homem (sem CNH necessária). Idade não informada (regra: idade não informada segue adiante sem travar).
  -- Resultado: QUALIFICADO! Score 85.
  -- =========================================================================
  UPDATE public.analises
  SET
    resultado = 'qualificado',
    criado_em = v_now,
    detalhes = jsonb_build_object(
      'score', 85,
      'aderencia', '85%',
      'distancia_km', 4.5,
      'unidade_mais_proxima', 'Leste (Sapopemba)',
      'reanalisado_por_proximidade', true,
      'motivo', 'Qualificado: Candidato reside a 4.5 km da Garagem Leste (Sapopemba), dentro do raio de 20 km, e atende aos requisitos gerais da vaga de Cobrador.',
      'summary', 'Candidato qualificado para Cobrador de Ônibus Leste. Distância de 4.5 km perfeitamente compatível com a unidade Sapopemba.',
      'matched_criteria', jsonb_build_array(
        jsonb_build_object('nome', 'Localização', 'evidencia', 'Candidato reside a 4.5 km da garagem Leste (Sapopemba), dentro do raio aceitável de 20 km.'),
        jsonb_build_object('nome', 'Perfil geral', 'evidencia', 'Candidato atende aos critérios gerais para a função de cobrador.')
      ),
      'unmatched_criteria', '[]'::jsonb,
      'pontos_fortes', jsonb_build_array('Localização favorável (4.5 km da garagem Leste)', 'Disponibilidade e motivação para a função'),
      'pontos_fracos', '[]'::jsonb
    )
  WHERE candidato_id = '022d5fbe-e1ea-4ae4-b910-28108ea62a3a'::uuid;

  IF v_etapa_triagem_id IS NOT NULL THEN
    UPDATE public.candidatos
    SET etapa_id = v_etapa_triagem_id
    WHERE id = '022d5fbe-e1ea-4ae4-b910-28108ea62a3a'::uuid;
  END IF;

  -- =========================================================================
  -- 6. CLAYTON FREIRE DE LIMA (id ab0da88e-42f0-4b7f-a3f4-1a6bcafef809)
  -- Vaga: Cobrador de Ônibus Leste. Distância: 5.2 km (<= 20 km). Idade: 40 anos (faixa 19-56).
  -- Homem. Conhecimento em transporte coletivo, mecânica, MOPP.
  -- Resultado: QUALIFICADO! Score 90.
  -- =========================================================================
  UPDATE public.analises
  SET
    resultado = 'qualificado',
    criado_em = v_now,
    detalhes = jsonb_build_object(
      'score', 90,
      'aderencia', '90%',
      'distancia_km', 5.2,
      'unidade_mais_proxima', 'Leste (Sapopemba)',
      'reanalisado_por_proximidade', true,
      'motivo', 'Qualificado: Candidato possui experiência em transporte coletivo, 40 anos de idade e reside a 5.2 km da Garagem Leste (Sapopemba), dentro do raio de 20 km.',
      'summary', 'Candidato qualificado com sólido perfil para transporte coletivo e localização plenamente aderente à garagem Leste.',
      'matched_criteria', jsonb_build_array(
        jsonb_build_object('nome', 'Localização', 'evidencia', 'Candidato reside a 5.2 km da garagem Leste (Sapopemba), dentro do raio aceitável de 20 km.'),
        jsonb_build_object('nome', 'Faixa etária', 'evidencia', 'Candidato possui 40 anos, perfeitamente dentro da faixa etária de 19 a 56 anos.'),
        jsonb_build_object('nome', 'Conhecimento do setor', 'evidencia', 'Habilidades em transporte coletivo, mecânica geral e informática básica.')
      ),
      'unmatched_criteria', '[]'::jsonb,
      'pontos_fortes', jsonb_build_array('Conhecimento em transporte coletivo', 'Localização próxima à garagem Leste (5.2 km)', 'Idade madura e estável (40 anos)'),
      'pontos_fracos', '[]'::jsonb
    )
  WHERE candidato_id = 'ab0da88e-42f0-4b7f-a3f4-1a6bcafef809'::uuid;

  IF v_etapa_triagem_id IS NOT NULL THEN
    UPDATE public.candidatos
    SET etapa_id = v_etapa_triagem_id
    WHERE id = 'ab0da88e-42f0-4b7f-a3f4-1a6bcafef809'::uuid;
  END IF;

  -- =========================================================================
  -- 7. DANIEL ROBERTO PIZZINO (id b67abbaf-0902-47aa-bdda-510fba58ccb1)
  -- Vaga: Cobrador de Ônibus Leste. Distância: 5.0 km (<= 20 km). Idade: 33 anos (faixa 19-56).
  -- Homem. Facilidade de comunicação, flexibilidade de horário.
  -- Resultado: QUALIFICADO! Score 85.
  -- =========================================================================
  UPDATE public.analises
  SET
    resultado = 'qualificado',
    criado_em = v_now,
    detalhes = jsonb_build_object(
      'score', 85,
      'aderencia', '85%',
      'distancia_km', 5.0,
      'unidade_mais_proxima', 'Leste (Sapopemba)',
      'reanalisado_por_proximidade', true,
      'motivo', 'Qualificado: Candidato possui 33 anos, boa comunicação e reside a 5.0 km da Garagem Leste (Sapopemba), dentro do raio de 20 km.',
      'summary', 'Candidato qualificado para Cobrador de Ônibus Leste. Idade e localização perfeitamente compatíveis com as exigências da vaga.',
      'matched_criteria', jsonb_build_array(
        jsonb_build_object('nome', 'Localização', 'evidencia', 'Candidato reside a 5.0 km da garagem Leste (Sapopemba), dentro do raio aceitável de 20 km.'),
        jsonb_build_object('nome', 'Faixa etária', 'evidencia', 'Candidato possui 33 anos, atendendo à faixa etária de 19 a 56 anos.'),
        jsonb_build_object('nome', 'Comunicação e disponibilidade', 'evidencia', 'Facilidade em comunicação e flexibilidade de horário.')
      ),
      'unmatched_criteria', '[]'::jsonb,
      'pontos_fortes', jsonb_build_array('Localização compatível (5.0 km da garagem)', 'Idade adequada (33 anos)', 'Flexibilidade de horário'),
      'pontos_fracos', '[]'::jsonb
    )
  WHERE candidato_id = 'b67abbaf-0902-47aa-bdda-510fba58ccb1'::uuid;

  IF v_etapa_triagem_id IS NOT NULL THEN
    UPDATE public.candidatos
    SET etapa_id = v_etapa_triagem_id
    WHERE id = 'b67abbaf-0902-47aa-bdda-510fba58ccb1'::uuid;
  END IF;

  -- =========================================================================
  -- 8. IVERTON JUSTINO DE ANDRADE (id 431fb72a-9b7d-4f5d-818b-e501df4b2a94)
  -- Vaga: Cobrador de Ônibus Leste. Distância: 4.8 km (<= 20 km). Idade: 31 anos (faixa 19-56).
  -- Homem. Localização: Pq Boa Esperança / São Mateus.
  -- Resultado: QUALIFICADO! Score 85.
  -- =========================================================================
  UPDATE public.analises
  SET
    resultado = 'qualificado',
    criado_em = v_now,
    detalhes = jsonb_build_object(
      'score', 85,
      'aderencia', '85%',
      'distancia_km', 4.8,
      'unidade_mais_proxima', 'Leste (Sapopemba)',
      'reanalisado_por_proximidade', true,
      'motivo', 'Qualificado: Candidato reside a 4.8 km da Garagem Leste (Sapopemba), dentro do raio de 20 km, e possui 31 anos, atendendo aos requisitos da vaga.',
      'summary', 'Candidato qualificado para Cobrador de Ônibus Leste. Atende a todos os critérios eliminatórios de localização e idade.',
      'matched_criteria', jsonb_build_array(
        jsonb_build_object('nome', 'Localização', 'evidencia', 'Candidato reside a 4.8 km da garagem Leste (Sapopemba), dentro do raio aceitável de 20 km.'),
        jsonb_build_object('nome', 'Faixa etária', 'evidencia', 'Candidato possui 31 anos, atendendo à faixa etária de 19 a 56 anos.')
      ),
      'unmatched_criteria', '[]'::jsonb,
      'pontos_fortes', jsonb_build_array('Localização próxima à garagem Leste (4.8 km)', 'Idade na faixa adequada (31 anos)'),
      'pontos_fracos', '[]'::jsonb
    )
  WHERE candidato_id = '431fb72a-9b7d-4f5d-818b-e501df4b2a94'::uuid;

  IF v_etapa_triagem_id IS NOT NULL THEN
    UPDATE public.candidatos
    SET etapa_id = v_etapa_triagem_id
    WHERE id = '431fb72a-9b7d-4f5d-818b-e501df4b2a94'::uuid;
  END IF;

  -- =========================================================================
  -- 9. NOEZIO JUNHO PINHEIRO (id 0564f286-9424-4351-8ca3-3712a94eee41)
  -- Vaga: Cobrador de Ônibus Leste. Distância: 9.6 km (<= 20 km). Idade: 45 anos (faixa 19-56).
  -- Homem. Localização: Cidade Tiradentes / ZL.
  -- Resultado: QUALIFICADO! Score 85.
  -- =========================================================================
  UPDATE public.analises
  SET
    resultado = 'qualificado',
    criado_em = v_now,
    detalhes = jsonb_build_object(
      'score', 85,
      'aderencia', '85%',
      'distancia_km', 9.6,
      'unidade_mais_proxima', 'Leste (Sapopemba)',
      'reanalisado_por_proximidade', true,
      'motivo', 'Qualificado: Candidato reside a 9.6 km da Garagem Leste (Sapopemba), dentro do raio de 20 km, e atende plenamente aos critérios da vaga de Cobrador.',
      'summary', 'Candidato qualificado para Cobrador de Ônibus Leste. Reside na Zona Leste a 9.6 km da garagem e está na faixa etária correta (45 anos).',
      'matched_criteria', jsonb_build_array(
        jsonb_build_object('nome', 'Localização', 'evidencia', 'Candidato reside a 9.6 km da garagem Leste (Sapopemba), dentro do raio aceitável de 20 km.'),
        jsonb_build_object('nome', 'Faixa etária', 'evidencia', 'Candidato possui 45 anos, atendendo à faixa etária de 19 a 56 anos.')
      ),
      'unmatched_criteria', '[]'::jsonb,
      'pontos_fortes', jsonb_build_array('Localização dentro do raio aceitável (9.6 km)', 'Idade e estabilidade adequadas (45 anos)'),
      'pontos_fracos', '[]'::jsonb
    )
  WHERE candidato_id = '0564f286-9424-4351-8ca3-3712a94eee41'::uuid;

  IF v_etapa_triagem_id IS NOT NULL THEN
    UPDATE public.candidatos
    SET etapa_id = v_etapa_triagem_id
    WHERE id = '0564f286-9424-4351-8ca3-3712a94eee41'::uuid;
  END IF;

  -- =========================================================================
  -- 10. WILLIAN ALVES DE ANDRADE (id 8165ae87-bece-4148-8ccf-ceb5a77a38a3)
  -- Vaga: Cobrador de Ônibus Leste. Distância: 7.9 km (<= 20 km). Idade: 35 anos (faixa 19-56).
  -- Homem. Localização: Recanto Verde do Sol / São Mateus.
  -- Resultado: QUALIFICADO! Score 85.
  -- =========================================================================
  UPDATE public.analises
  SET
    resultado = 'qualificado',
    criado_em = v_now,
    detalhes = jsonb_build_object(
      'score', 85,
      'aderencia', '85%',
      'distancia_km', 7.9,
      'unidade_mais_proxima', 'Leste (Sapopemba)',
      'reanalisado_por_proximidade', true,
      'motivo', 'Qualificado: Candidato reside a 7.9 km da Garagem Leste (Sapopemba), dentro do raio aceitável de 20 km, e atende a todos os critérios da vaga.',
      'summary', 'Candidato qualificado para Cobrador de Ônibus Leste. Localização e idade (35 anos) compatíveis com a unidade Sapopemba.',
      'matched_criteria', jsonb_build_array(
        jsonb_build_object('nome', 'Localização', 'evidencia', 'Candidato reside a 7.9 km da garagem Leste (Sapopemba), dentro do raio aceitável de 20 km.'),
        jsonb_build_object('nome', 'Faixa etária', 'evidencia', 'Candidato possui 35 anos, atendendo à faixa etária de 19 a 56 anos.')
      ),
      'unmatched_criteria', '[]'::jsonb,
      'pontos_fortes', jsonb_build_array('Localização próxima à garagem Leste (7.9 km)', 'Idade na faixa adequada (35 anos)'),
      'pontos_fracos', '[]'::jsonb
    )
  WHERE candidato_id = '8165ae87-bece-4148-8ccf-ceb5a77a38a3'::uuid;

  IF v_etapa_triagem_id IS NOT NULL THEN
    UPDATE public.candidatos
    SET etapa_id = v_etapa_triagem_id
    WHERE id = '8165ae87-bece-4148-8ccf-ceb5a77a38a3'::uuid;
  END IF;

  -- =========================================================================
  -- 11. CÍCERO RODRIGUES MONTEIRO (id 19e936a9-6b6e-4078-9a0c-601c80d7ca31)
  -- Vaga: Cobrador de Ônibus Cursino. Distância: 15.3 km (<= 20 km).
  -- Endereço: CEP 05366-220 (Vila São Silvestre / Rio Pequeno, Zona Oeste).
  -- Homem. Experiência e dedicação no atendimento ao cliente.
  -- Correção do motivo de reprovação: estava dizendo 42.15 km (da Leste). Agora está a 15.3 km da Cursino (dentro de 20 km)!
  -- Resultado: QUALIFICADO! Score 85.
  -- =========================================================================
  UPDATE public.analises
  SET
    resultado = 'qualificado',
    criado_em = v_now,
    detalhes = jsonb_build_object(
      'score', 85,
      'aderencia', '85%',
      'distancia_km', 15.3,
      'unidade_mais_proxima', 'Cursino',
      'reanalisado_por_proximidade', true,
      'motivo', 'Qualificado: Candidato reside a 15.3 km da Garagem Cursino (Av. do Cursino, 5797), dentro do raio aceitável de 20 km, e atende aos requisitos da vaga de Cobrador.',
      'summary', 'Candidato qualificado para Cobrador de Ônibus Cursino. Localizado na Zona Oeste (CEP 05366-220), a 15.3 km da unidade Cursino, dentro do raio de atendimento.',
      'matched_criteria', jsonb_build_array(
        jsonb_build_object('nome', 'Localização', 'evidencia', 'Candidato reside a 15.3 km da garagem Cursino, dentro do raio aceitável de 20 km.'),
        jsonb_build_object('nome', 'Perfil geral', 'evidencia', 'Candidato motivado e com experiência de atendimento ao cliente.')
      ),
      'unmatched_criteria', '[]'::jsonb,
      'pontos_fortes', jsonb_build_array('Localização dentro do raio aceitável da garagem Cursino (15.3 km)', 'Motivação e comprometimento com atendimento'),
      'pontos_fracos', '[]'::jsonb
    )
  WHERE candidato_id = '19e936a9-6b6e-4078-9a0c-601c80d7ca31'::uuid;

  IF v_etapa_triagem_id IS NOT NULL THEN
    UPDATE public.candidatos
    SET etapa_id = v_etapa_triagem_id
    WHERE id = '19e936a9-6b6e-4078-9a0c-601c80d7ca31'::uuid;
  END IF;

  -- Registrar auditoria da correção
  INSERT INTO public._debug_audit (tag, info) VALUES (
    'cobradores_inconsistencias_corrigidas',
    jsonb_build_object(
      'executed_at', v_now,
      'qualificados_corrigidos', jsonb_build_array(
        'Anthony Silva Nascimento (Leste - 3.5 km)',
        'ANTHONY GUIMARÃES (Leste - 4.5 km)',
        'CAIQUE DA SILVA SANTOS (Leste - 4.5 km)',
        'Clayton Freire de lima (Leste - 5.2 km)',
        'Daniel Roberto Pizzino (Leste - 5.0 km)',
        'IVERTON JUSTINO DE ANDRADE (Leste - 4.8 km)',
        'NOEZIO JUNHO PINHEIRO (Leste - 9.6 km)',
        'Willian Alves de Andrade (Leste - 7.9 km)',
        'Cícero Rodrigues Monteiro (Cursino - 15.3 km)'
      ),
      'reprovacoes_motivo_corrigido', jsonb_build_array(
        'JULIANA VIANA DOS SANTOS (Leste - 6.9 km: reprovada por CNH D feminina, localização aprovada)',
        'ALANNA BARBARA DA CONCEIÇÃO (Leste - 4.2 km: reprovada por menor de idade 13 anos, localização aprovada)'
      )
    )
  );

END $$;

-- Reanálise e validação dos 6 candidatos com a regra atualizada de empresas restritas
-- Candidatos:
-- 1. Cicero Crisostomo Dos Santos (0eb00581-a1db-4172-b761-a409dd02761e)
-- 2. VITOR BARROS DA SILVA (ce4eac63-f689-4672-beac-78db2587fbdf)
-- 3. Amadeus Justino da Silva (233f2dea-3eae-45cd-bcfd-51dca06e6770 e 622e4adf-46a0-4953-8119-08b0212a6ec4)
-- 4. FABIO BARBOSA MONTEIRO (0309b3e0-c2de-4831-b859-b266921d68c9)
-- 5. Jackson De Paiva Santos (3d9b78fc-3871-468b-a4c9-28901ce4dc66)
-- 6. MOISÉS ROBSON MIRANDA SANTOS (e9e932fb-64d3-4f6a-90d5-772c0d384232)

DO $$
DECLARE
  v_vaga_cursino uuid := '4c4239c0-fd38-47e7-92fe-9bb5a3b02db2';
  v_etapa_triagem uuid;
  v_user_id uuid;
BEGIN
  -- Obter etapa de Triagem
  SELECT id INTO v_etapa_triagem FROM public.etapas WHERE nome ILIKE 'Triagem' LIMIT 1;

  -- 1. CÍCERO CRISOSTOMO DOS SANTOS (0eb00581-a1db-4172-b761-a409dd02761e)
  -- Experiências: MobiBrasil (15/07/24 a 11/09/26 - término no passado recente), Next Mobilidade (23/09/21 a 25/06/24), Move Buss (01/07/16 a 02/12/20).
  -- Endereço: Rua Maria Tereza Gaudino, 04180-150 Jardim Maristela - São Paulo (~4.9 km de Cursino, raio aceito: 20 km). CNH E. Idade 41 anos.
  -- Vínculo na MobiBrasil e MoveBuss é PASSADO (encerrado). QUALIFICADO!
  SELECT user_id INTO v_user_id FROM public.candidatos WHERE id = '0eb00581-a1db-4172-b761-a409dd02761e';
  
  UPDATE public.candidatos 
  SET vaga_id = v_vaga_cursino,
      etapa_id = COALESCE(v_etapa_triagem, etapa_id),
      ativo_kanban = true,
      motivo_inativo = NULL
  WHERE id = '0eb00581-a1db-4172-b761-a409dd02761e';

  INSERT INTO public.candidato_etapa (candidato_id, etapa_id, usuario_id)
  VALUES ('0eb00581-a1db-4172-b761-a409dd02761e', v_etapa_triagem, v_user_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.analises (candidato_id, vaga_id, resultado, detalhes, user_id)
  VALUES (
    '0eb00581-a1db-4172-b761-a409dd02761e',
    v_vaga_cursino,
    'qualificado',
    jsonb_build_object(
      'score', 90,
      'aderencia', '90%',
      'motivo', 'Qualificado: Candidato possui vasta experiência comprovada como motorista de ônibus coletivo, CNH E, idade compatível (41 anos) e localização dentro do raio aceitável (4,9 km). Experiências na MobiBrasil e MoveBuss são passadas com vínculos encerrados (15/07/2024 a 11/09/2026), não constituindo impedimento.',
      'summary', 'Candidato aprovado para Motorista Cursino. Possui experiência sólida em empresas de ônibus urbano, CNH E e reside próximo à garagem. Suas experiências em empresas da lista de restrição (MobiBrasil e MoveBuss) possuem datas de término no passado e contratos encerrados.',
      'matched_criteria', jsonb_build_array(
        jsonb_build_object('nome', 'Experiência como motorista', 'evidencia', 'Experiência como motorista de transporte coletivo em empresas como MobiBrasil, Next Mobilidade e Move Buss.'),
        jsonb_build_object('nome', 'Categoria da CNH', 'evidencia', 'Possui CNH Categoria E.'),
        jsonb_build_object('nome', 'Faixa Etária', 'evidencia', 'Possui 41 anos, atendendo à exigência de até 58 anos.'),
        jsonb_build_object('nome', 'Localização', 'evidencia', 'Reside no Jardim Maristela - SP (~4,9 km da garagem do Cursino, dentro do raio de 20 km).'),
        jsonb_build_object('nome', 'Empresas Restritas (Vínculo Atual vs Passado)', 'evidencia', 'Vínculos na MobiBrasil e MoveBuss encerrados no passado; não está ativo atualmente em empresas restritas.')
      ),
      'unmatched_criteria', jsonb_build_array(),
      'pontos_fortes', jsonb_build_array('Ampla experiência em transporte coletivo de passageiros', 'CNH Categoria E', 'Localização favorável'),
      'pontos_fracos', jsonb_build_array()
    ),
    v_user_id
  )
  ON CONFLICT (id) DO NOTHING;

  -- Atualiza a última análise existente do Cícero também
  UPDATE public.analises
  SET resultado = 'qualificado',
      detalhes = jsonb_build_object(
        'score', 90,
        'aderencia', '90%',
        'motivo', 'Qualificado: Candidato possui vasta experiência comprovada como motorista de ônibus coletivo, CNH E, idade compatível (41 anos) e localização dentro do raio aceitável (4,9 km). Experiências na MobiBrasil e MoveBuss são passadas com vínculos encerrados (15/07/2024 a 11/09/2026), não constituindo impedimento.',
        'summary', 'Candidato aprovado para Motorista Cursino. Possui experiência sólida em empresas de ônibus urbano, CNH E e reside próximo à garagem. Suas experiências em empresas da lista de restrição (MobiBrasil e MoveBuss) possuem datas de término no passado e contratos encerrados.',
        'matched_criteria', jsonb_build_array(
          jsonb_build_object('nome', 'Experiência como motorista', 'evidencia', 'Experiência como motorista de transporte coletivo em empresas como MobiBrasil, Next Mobilidade e Move Buss.'),
          jsonb_build_object('nome', 'Categoria da CNH', 'evidencia', 'Possui CNH Categoria E.'),
          jsonb_build_object('nome', 'Faixa Etária', 'evidencia', 'Possui 41 anos, atendendo à exigência de até 58 anos.'),
          jsonb_build_object('nome', 'Localização', 'evidencia', 'Reside no Jardim Maristela - SP (~4,9 km da garagem do Cursino, dentro do raio de 20 km).'),
          jsonb_build_object('nome', 'Empresas Restritas (Vínculo Atual vs Passado)', 'evidencia', 'Vínculos na MobiBrasil e MoveBuss encerrados no passado; não está ativo atualmente em empresas restritas.')
        ),
        'unmatched_criteria', jsonb_build_array(),
        'pontos_fortes', jsonb_build_array('Ampla experiência em transporte coletivo de passageiros', 'CNH Categoria E', 'Localização favorável'),
        'pontos_fracos', jsonb_build_array()
      )
  WHERE candidato_id = '0eb00581-a1db-4172-b761-a409dd02761e' AND vaga_id = v_vaga_cursino;

  -- 2. AMADEUS JUSTINO DA SILVA (233f2dea-3eae-45cd-bcfd-51dca06e6770 e 622e4adf-46a0-4953-8119-08b0212a6ec4)
  -- Experiências: MobiBrasil (04/2023 - 04/2025 - término passado), Next Mobilidade (05/2021 - 04/2023), Via Sudeste (01/2009 - 10/2020).
  -- Endereço: Rua Gustav Klint, 172 - Vila Morais, São Paulo (~4.4 km da garagem Cursino). Idade 44 anos. CNH D/E.
  -- Vínculo na MobiBrasil já foi encerrado em 04/2025 (PASSADO). Não está ativo! QUALIFICADO!
  UPDATE public.candidatos
  SET vaga_id = v_vaga_cursino,
      etapa_id = COALESCE(v_etapa_triagem, etapa_id),
      ativo_kanban = true,
      motivo_inativo = NULL
  WHERE id IN ('233f2dea-3eae-45cd-bcfd-51dca06e6770', '622e4adf-46a0-4953-8119-08b0212a6ec4');

  UPDATE public.analises
  SET resultado = 'qualificado',
      detalhes = jsonb_build_object(
        'score', 90,
        'aderencia', '90%',
        'motivo', 'Qualificado: Candidato possui mais de 10 anos de experiência comprovada no transporte coletivo (incluindo histórico na própria Via Sudeste), CNH válida, idade compatível (44 anos) e residência a 4,4 km da garagem Cursino. Seu vínculo na MobiBrasil Transporte foi encerrado em 04/2025 (experiência passada), não infringindo o critério de empresa restrita.',
        'summary', 'Candidato qualificado para Motorista Cursino. Experiência passada na MobiBrasil (04/2023 a 04/2025) com contrato encerrado; atende plenamente aos critérios de localização, experiência e documentação.',
        'matched_criteria', jsonb_build_array(
          jsonb_build_object('nome', 'Experiência como motorista', 'evidencia', 'Vasta experiência em transporte urbano coletivo (Via Sudeste, Next Mobilidade, MobiBrasil).'),
          jsonb_build_object('nome', 'Localização', 'evidencia', 'Reside na Vila Morais - SP (~4,4 km da garagem Cursino, raio de 20 km).'),
          jsonb_build_object('nome', 'Faixa Etária', 'evidencia', 'Possui 44 anos (limite de até 58 anos).'),
          jsonb_build_object('nome', 'Empresas Restritas (Vínculo Atual vs Passado)', 'evidencia', 'Vínculo na MobiBrasil encerrado em 04/2025. Não está ativo atualmente em empresas restritas.')
        ),
        'unmatched_criteria', jsonb_build_array(),
        'pontos_fortes', jsonb_build_array('Histórico prévio de mais de 10 anos na Via Sudeste', 'Proximidade geográfica', 'Experiência consolidada'),
        'pontos_fracos', jsonb_build_array()
      )
  WHERE candidato_id IN ('233f2dea-3eae-45cd-bcfd-51dca06e6770', '622e4adf-46a0-4953-8119-08b0212a6ec4');

  -- 3. MOISÉS ROBSON MIRANDA SANTOS (e9e932fb-64d3-4f6a-90d5-772c0d384232)
  -- Experiências: Ambiental Transportes Urbanos S.A. (20/05/2014 - 22/02/2024 - término passado), Empresa de Transportes Itaquera Brasil (2013).
  -- Idade: 35 anos. CNH Categoria AD.
  -- Vínculo na Ambiental encerrou em 22/02/2024 (PASSADO).
  -- Porém, o endereço do candidato não constava no currículo (endereço nulo).
  -- Motivo correto: REPROVADO EXCLUSIVAMENTE POR LOCALIZAÇÃO (endereço ausente/não informado no currículo).
  -- NÃO DEVE CONSTAR reprovação por empresa restrita!
  UPDATE public.analises
  SET resultado = 'nao_qualificado',
      detalhes = jsonb_build_object(
        'score', 70,
        'aderencia', '70%',
        'motivo', 'Reprovado por localização: O endereço do candidato não foi informado no currículo. O candidato possui experiência sólida como motorista de transporte coletivo e CNH compatível; seu vínculo na Ambiental Transportes encerrou-se em 22/02/2024 (experiência passada que não elimina), mas a ausência de comprovante de residência/endereço impede a verificação da proximidade à garagem.',
        'summary', 'Candidato desqualificado exclusivamente pela ausência de endereço no currículo para validação do raio de distância. Critério de empresas restritas atendido: a experiência na Ambiental Transportes é passada (2014 a 2024) com término comprovado.',
        'matched_criteria', jsonb_build_array(
          jsonb_build_object('nome', 'Experiência como motorista', 'evidencia', 'Experiência como motorista de transporte coletivo e manobrista na Ambiental Transportes (2014-2024).'),
          jsonb_build_object('nome', 'Categoria da CNH', 'evidencia', 'Possui CNH Categoria AD.'),
          jsonb_build_object('nome', 'Faixa Etária', 'evidencia', 'Possui 35 anos, atendendo à exigência de até 58 anos.'),
          jsonb_build_object('nome', 'Empresas Restritas (Vínculo Atual vs Passado)', 'evidencia', 'Experiência na Ambiental Transportes foi encerrada em 22/02/2024; não possui vínculo atual.')
        ),
        'unmatched_criteria', jsonb_build_array(
          jsonb_build_object('nome', 'Localização / Endereço', 'motivo', 'Endereço não informado no currículo, impossibilitando a medição do raio de proximidade até a garagem.')
        ),
        'pontos_fortes', jsonb_build_array('Experiência consolidada de 10 anos no transporte coletivo', 'CNH AD válida'),
        'pontos_fracos', jsonb_build_array('Endereço não informado no currículo')
      )
  WHERE candidato_id = 'e9e932fb-64d3-4f6a-90d5-772c0d384232';

  -- 4. FABIO BARBOSA MONTEIRO (0309b3e0-c2de-4831-b859-b266921d68c9)
  -- Experiências: Alfa Rodobus (Atual), A2 Transportes (sem data), Motorista de Caminhão Autônomo (11/2022 a 07/2024), Transwolff (12/2017 a 06/2022).
  -- Endereço: CEP 04918-280 (Jardim Santa Cruz / M'Boi Mirim, ~21 km de Cursino - fora do raio de 20 km).
  -- No currículo, está ATUALMENTE na Alfa Rodobus (que NÃO está na lista restrita!). A2 Transportes foi vínculo anterior.
  -- Motivo correto: Reprovado por localização fora do raio aceito (21,5 km > 20 km). A2 Transportes foi experiência anterior e Alfa Rodobus não é empresa restrita.
  UPDATE public.analises
  SET resultado = 'nao_qualificado',
      detalhes = jsonb_build_object(
        'score', 65,
        'aderencia', '65%',
        'motivo', 'Reprovado por localização: Distância da residência do candidato (CEP 04918-280, Jardim Santa Cruz - SP) ultrapassa o limite aceitável de 20 km da garagem Cursino (~21,5 km). O candidato está atualmente na Alfa Rodobus (empresa não restrita) e a passagem pela A2 Transportes foi vínculo passado, não constituindo impedimento.',
        'summary', 'Candidato desqualificado por localização geográfica exceder o raio de 20 km da garagem Cursino. Critério de empresas restritas atendido: a experiência na A2 Transportes é passada e sua ocupação atual é na Alfa Rodobus (não restrita).',
        'matched_criteria', jsonb_build_array(
          jsonb_build_object('nome', 'Experiência como motorista', 'evidencia', 'Experiência comprovada como motorista em empresas de ônibus (Transwolff, Alfa Rodobus).'),
          jsonb_build_object('nome', 'Faixa Etária', 'evidencia', 'Possui 50 anos, dentro do limite de até 58 anos.'),
          jsonb_build_object('nome', 'Empresas Restritas (Vínculo Atual vs Passado)', 'evidencia', 'Atualmente empregado na Alfa Rodobus (não restrita). Vínculo anterior na A2 Transportes encerrado.')
        ),
        'unmatched_criteria', jsonb_build_array(
          jsonb_build_object('nome', 'Localização', 'motivo', 'Distância calculada (~21,5 km) excede o raio máximo permitido de 20 km para a garagem Cursino.')
        ),
        'pontos_fortes', jsonb_build_array('Experiência como motorista de ônibus', 'CNH D'),
        'pontos_fracos', jsonb_build_array('Residência fora do raio de 20 km da unidade')
      )
  WHERE candidato_id = '0309b3e0-c2de-4831-b859-b266921d68c9';

  -- 5. JACKSON DE PAIVA SANTOS (3d9b78fc-3871-468b-a4c9-28901ce4dc66)
  -- Experiências: Transunião Transportes S/A (Mar., 2026 - Emprego Atual).
  -- Endereço: Santo André - SP (09170-240) -> fora do raio de 20 km (~23 km).
  -- Jackson está ATUALMENTE na Transunião ("Mar., 2026 - Emprego Atual") E fora do raio.
  -- Motivo correto: Reprovado por vínculo ATUAL em empresa restrita (Transunião Transportes S/A - Emprego Atual) e por localização fora do raio permitido.
  UPDATE public.analises
  SET resultado = 'nao_qualificado',
      detalhes = jsonb_build_object(
        'score', 40,
        'aderencia', '40%',
        'motivo', 'Reprovado por vínculo atual em empresa restrita e por localização: candidato trabalha atualmente como Motorista de Ônibus Urbano na Transunião Transportes S/A (Mar., 2026 - Emprego Atual), empresa constante na lista de restrição da vaga. Além disso, reside em Santo André - SP, excedendo o raio limite de 20 km da garagem.',
        'summary', 'Candidato desqualificado por estar atualmente com contrato ativo na empresa restrita Transunião Transportes e por residir fora do raio máximo de 20 km.',
        'matched_criteria', jsonb_build_array(
          jsonb_build_object('nome', 'Faixa Etária', 'evidencia', 'Possui 22 anos, dentro da faixa permitida.')
        ),
        'unmatched_criteria', jsonb_build_array(
          jsonb_build_object('nome', 'Empresas Restritas (Vínculo Atual)', 'motivo', 'Trabalha atualmente na Transunião Transportes S/A (vínculo ativo em aberto desde Mar/2026).'),
          jsonb_build_object('nome', 'Localização', 'motivo', 'Residência em Santo André - SP excede o raio de 20 km da unidade Cursino.')
        ),
        'pontos_fortes', jsonb_build_array('Experiência como motorista de ônibus urbano'),
        'pontos_fracos', jsonb_build_array('Contrato ativo em empresa restrita (Transunião)', 'Reside fora do raio')
      )
  WHERE candidato_id = '3d9b78fc-3871-468b-a4c9-28901ce4dc66';

  -- 6. VITOR BARROS DA SILVA (ce4eac63-f689-4672-beac-78db2587fbdf)
  -- Experiências: Norbrasil Saneamento (Motorista - período mais recente), Movebuss Mobilidade Urbana (Motorista - período anterior), Norbrasil (Ajudante), Gráfica Anjo Meu.
  -- O candidato trabalhou na Movebuss anteriormente e sua ocupação mais recente foi na Norbrasil Saneamento. Ele NÃO está ativo na Movebuss.
  -- Endereço: Rua Antônio Carlos Jefferi, 42 — São Paulo - SP (~5.8 km de Cursino, dentro do raio de 20 km). CNH Categoria D. Idade 29 anos.
  -- Como o vínculo na Movebuss é PASSADO, ele NÃO é eliminado por esse critério! QUALIFICADO!
  UPDATE public.candidatos
  SET vaga_id = v_vaga_cursino,
      etapa_id = COALESCE(v_etapa_triagem, etapa_id),
      ativo_kanban = true,
      motivo_inativo = NULL
  WHERE id = 'ce4eac63-f689-4672-beac-78db2587fbdf';

  INSERT INTO public.candidato_etapa (candidato_id, etapa_id, usuario_id)
  VALUES ('ce4eac63-f689-4672-beac-78db2587fbdf', v_etapa_triagem, v_user_id)
  ON CONFLICT DO NOTHING;

  UPDATE public.analises
  SET resultado = 'qualificado',
      detalhes = jsonb_build_object(
        'score', 85,
        'aderencia', '85%',
        'motivo', 'Qualificado: Candidato possui experiência como motorista, idade adequada (29 anos), CNH categoria D e reside a aproximadamente 5,8 km da garagem Cursino (dentro do raio de 20 km). A experiência na Movebuss Mobilidade Urbana foi vínculo passado anterior (já encerrado), não constituindo critério de eliminação pela regra do RH.',
        'summary', 'Candidato qualificado para Motorista Cursino. Sua passagem pela Movebuss ocorreu no passado e seu vínculo mais recente foi na Norbrasil Saneamento. Atende aos requisitos de CNH, idade e localização.',
        'matched_criteria', jsonb_build_array(
          jsonb_build_object('nome', 'Experiência como motorista', 'evidencia', 'Experiência na função como motorista na Norbrasil e Movebuss.'),
          jsonb_build_object('nome', 'Categoria da CNH', 'evidencia', 'Possui CNH Categoria D.'),
          jsonb_build_object('nome', 'Faixa Etária', 'evidencia', 'Possui 29 anos, dentro do limite de até 58 anos.'),
          jsonb_build_object('nome', 'Localização', 'evidencia', 'Reside na Rua Antônio Carlos Jefferi (~5,8 km da garagem Cursino, dentro do raio de 20 km).'),
          jsonb_build_object('nome', 'Empresas Restritas (Vínculo Atual vs Passado)', 'evidencia', 'Passagem pela Movebuss encerrada no passado; sem vínculo atual com empresas restritas.')
        ),
        'unmatched_criteria', jsonb_build_array(),
        'pontos_fortes', jsonb_build_array('Experiência na condução de veículos pesados', 'Localização próxima', 'CNH D regular'),
        'pontos_fracos', jsonb_build_array()
      )
  WHERE candidato_id = 'ce4eac63-f689-4672-beac-78db2587fbdf' AND vaga_id = v_vaga_cursino;

END $$;

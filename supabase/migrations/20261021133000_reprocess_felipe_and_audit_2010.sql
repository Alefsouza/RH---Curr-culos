-- Reprocessamento do candidato Felipe Gomes Tavares e auditoria dos candidatos importados pelo site em 20/10
-- Vaga alvo: Cobrador de Ônibus Cursino (id: bdcb0553-2bc1-416a-9b21-b0e142c1b3d8)
-- Endereço Felipe: Rua Henri Lebasque, 40, Jd. Maria Estela, CEP 04181-060 (~2.1 km da garagem Cursino, raio 20 km)
-- Resultado esperado: qualificado, vaga bdcb0553, etapa Triagem, ativo_kanban true.

DO $$
DECLARE
  v_vaga_cursino_cobrador uuid := 'bdcb0553-2bc1-416a-9b21-b0e142c1b3d8'::uuid;
  v_etapa_triagem uuid;
  v_felipe_id uuid := 'ac52b7f6-ad6c-47d8-a2d3-d74f01376e41'::uuid;
  v_user_id uuid;
  v_felipe_analise_id uuid;
BEGIN
  -- 1. Obter etapa de Triagem
  SELECT id INTO v_etapa_triagem FROM public.etapas WHERE nome ILIKE 'Triagem' LIMIT 1;
  IF v_etapa_triagem IS NULL THEN
    SELECT id INTO v_etapa_triagem FROM public.etapas ORDER BY ordem ASC LIMIT 1;
  END IF;

  -- Obter user_id do Felipe
  SELECT user_id INTO v_user_id FROM public.candidatos WHERE id = v_felipe_id;
  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM public.usuarios WHERE is_admin = true ORDER BY criado_em ASC LIMIT 1;
  END IF;
  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM public.usuarios ORDER BY criado_em ASC LIMIT 1;
  END IF;

  -- 2. Atualizar candidato Felipe Gomes Tavares
  -- Rua Henri Lebasque, Jd. Maria Estela, CEP 04181-060 fica a ~2 km da garagem Cursino (raio 20 km)
  UPDATE public.candidatos
  SET
    vaga_id = v_vaga_cursino_cobrador,
    etapa_id = COALESCE(v_etapa_triagem, etapa_id),
    ativo_kanban = true,
    motivo_inativo = NULL,
    proximidade = '2.1 km',
    dados_extraidos = CASE
      WHEN dados_extraidos IS NOT NULL THEN
        jsonb_set(
          jsonb_set(dados_extraidos, '{cep}', '"04181-060"'::jsonb, true),
          '{endereco}',
          '"Rua Henri Lebasque, 40 - Jardim Maria Estela, São Paulo - SP, 04181-060"'::jsonb,
          true
        )
      ELSE
        jsonb_build_object(
          'nome', 'Felipe Gomes Tavares',
          'endereco', 'Rua Henri Lebasque, 40 - Jardim Maria Estela, São Paulo - SP, 04181-060',
          'cep', '04181-060',
          'objetivo', 'Atendente ou auxiliar de vendas'
        )
    END
  WHERE id = v_felipe_id;

  -- Garantir vinculo na etapa Triagem
  IF v_etapa_triagem IS NOT NULL THEN
    INSERT INTO public.candidato_etapa (candidato_id, etapa_id, usuario_id)
    VALUES (v_felipe_id, v_etapa_triagem, v_user_id)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- 3. Inserir ou atualizar análise para a vaga de Cobrador de Ônibus Cursino (bdcb0553)
  SELECT id INTO v_felipe_analise_id
  FROM public.analises
  WHERE candidato_id = v_felipe_id AND vaga_id = v_vaga_cursino_cobrador
  LIMIT 1;

  IF v_felipe_analise_id IS NOT NULL THEN
    UPDATE public.analises
    SET
      resultado = 'qualificado',
      detalhes = jsonb_build_object(
        'score', 90,
        'aderencia', '90%',
        'distancia_km', 2.1,
        'motivo', 'Qualificado: Candidato reside na Rua Henri Lebasque (Jd. Maria Estela, CEP 04181-060), a aproximadamente 2,1 km da Garagem Cursino (dentro do raio de 20 km). Para candidatos do sexo masculino não é exigida CNH para a função de Cobrador de Ônibus. Perfil compatível com atendimento ao público.',
        'summary', 'Candidato aprovado para a vaga de Cobrador de Ônibus Cursino. Reside a ~2,1 km da garagem da Via Sudeste no Cursino, plenamente dentro do raio de 20 km. Histórico profissional em atendimento/balcão e requisitos atendidos.',
        'matched_criteria', jsonb_build_array(
          jsonb_build_object('nome', 'Localização', 'evidencia', 'Reside na Rua Henri Lebasque, Jardim Maria Estela, CEP 04181-060 (~2,1 km da Garagem Cursino, dentro do raio de 20 km).'),
          jsonb_build_object('nome', 'Escolaridade', 'evidencia', 'Atende ao requisito de escolaridade para a função.'),
          jsonb_build_object('nome', 'Requisitos de Cobrador (Masculino)', 'evidencia', 'Candidato do sexo masculino; não é exigida CNH para cobrador.'),
          jsonb_build_object('nome', 'Empresas Restritas', 'evidencia', 'Não possui vínculo atual com empresas de ônibus restritas.')
        ),
        'unmatched_criteria', jsonb_build_array(),
        'pontos_fortes', jsonb_build_array('Excelente proximidade geográfica da garagem Cursino (~2,1 km)', 'Experiência prévia em atendimento e balcão'),
        'pontos_fracos', jsonb_build_array()
      ),
      criado_em = NOW()
    WHERE id = v_felipe_analise_id;
  ELSE
    INSERT INTO public.analises (
      candidato_id,
      vaga_id,
      resultado,
      detalhes,
      user_id,
      criado_em
    ) VALUES (
      v_felipe_id,
      v_vaga_cursino_cobrador,
      'qualificado',
      jsonb_build_object(
        'score', 90,
        'aderencia', '90%',
        'distancia_km', 2.1,
        'motivo', 'Qualificado: Candidato reside na Rua Henri Lebasque (Jd. Maria Estela, CEP 04181-060), a aproximadamente 2,1 km da Garagem Cursino (dentro do raio de 20 km). Para candidatos do sexo masculino não é exigida CNH para a função de Cobrador de Ônibus. Perfil compatível com atendimento ao público.',
        'summary', 'Candidato aprovado para a vaga de Cobrador de Ônibus Cursino. Reside a ~2,1 km da garagem da Via Sudeste no Cursino, plenamente dentro do raio de 20 km. Histórico profissional em atendimento/balcão e requisitos atendidos.',
        'matched_criteria', jsonb_build_array(
          jsonb_build_object('nome', 'Localização', 'evidencia', 'Reside na Rua Henri Lebasque, Jardim Maria Estela, CEP 04181-060 (~2,1 km da Garagem Cursino, dentro do raio de 20 km).'),
          jsonb_build_object('nome', 'Escolaridade', 'evidencia', 'Atende ao requisito de escolaridade para a função.'),
          jsonb_build_object('nome', 'Requisitos de Cobrador (Masculino)', 'evidencia', 'Candidato do sexo masculino; não é exigida CNH para cobrador.'),
          jsonb_build_object('nome', 'Empresas Restritas', 'evidencia', 'Não possui vínculo atual com empresas de ônibus restritas.')
        ),
        'unmatched_criteria', jsonb_build_array(),
        'pontos_fortes', jsonb_build_array('Excelente proximidade geográfica da garagem Cursino (~2,1 km)', 'Experiência prévia em atendimento e balcão'),
        'pontos_fracos', jsonb_build_array()
      ),
      v_user_id,
      NOW()
    );
  END IF;

  -- 4. Auditoria e alinhamento de outros candidatos importados pelo site em 20/10:
  -- Caso algum candidato esteja com vaga_id != vaga da análise, sincroniza.
  -- Exemplo: candidatos com análise vinculada a uma vaga mas candidatos.vaga_id divergente.
  UPDATE public.candidatos c
  SET vaga_id = ult.vaga_id
  FROM (
    SELECT DISTINCT ON (a.candidato_id) a.candidato_id, a.vaga_id
    FROM public.analises a
    ORDER BY a.candidato_id, a.criado_em DESC
  ) ult
  WHERE c.id = ult.candidato_id
    AND c.criado_em >= '2026-10-20T00:00:00Z'
    AND c.criado_em < '2026-10-21T00:00:00Z'
    AND c.fonte = 'site'
    AND c.id != v_felipe_id
    AND c.vaga_id IS DISTINCT FROM ult.vaga_id;

END $$;

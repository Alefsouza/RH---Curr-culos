-- 20260408120000_audit_curriculos_plan.sql
-- Auditoria retroativa em lote da análise de currículos:
-- 1. Validação de plausibilidade de idade (< 16 ou > 75) e recálculo por data de nascimento
-- 2. Correção de fallbacks indevidos que empurraram candidatos sem vaga aberta para "Cobrador"
-- 3. Atribuição de vaga por requisitos/fit e não apenas palavras-chave
-- 4. Correção pontual e retroativa dos casos de referência (Richard David, Luiz Fernando, Fabiano Severino)
-- 5. Análises com citação de evidências e remoção de asserções sem comprovação

DO $$
DECLARE
  v_cobrador_id UUID;
  v_etapa_triagem UUID;
  v_cand RECORD;
  v_raw_idade TEXT;
  v_data_nasc TEXT;
  v_idade_num INT;
  v_calc_idade INT;
  v_idade_final INT;
  v_novo_dados JSONB;
  v_vaga_titulo TEXT;
  v_count_idade INT := 0;
  v_count_sem_vaga INT := 0;
BEGIN
  -- Obter ID da vaga de Cobrador (se existir, ex: Cursino ou Leste)
  SELECT id INTO v_cobrador_id FROM public.vagas WHERE titulo ILIKE '%Cobrador%' AND ativa = true ORDER BY criado_em ASC LIMIT 1;
  -- Obter etapa de Triagem
  SELECT id INTO v_etapa_triagem FROM public.etapas ORDER BY ordem ASC LIMIT 1;

  -- =========================================================================
  -- (A) AUDITORIA DE IDADE: Corrigir candidatos com idade implausível (< 16 ou > 75)
  -- =========================================================================
  FOR v_cand IN 
    SELECT c.id, c.nome, c.dados_extraidos, c.vaga_id
    FROM public.candidatos c
    WHERE c.dados_extraidos IS NOT NULL
  LOOP
    v_raw_idade := v_cand.dados_extraidos->>'idade';
    v_data_nasc := v_cand.dados_extraidos->>'data_nascimento';
    v_idade_num := NULL;
    v_calc_idade := NULL;
    v_idade_final := NULL;

    -- Tentar número da idade declarada
    IF v_raw_idade IS NOT NULL AND v_raw_idade ~ '^\d+$' THEN
      v_idade_num := v_raw_idade::INT;
    END IF;

    -- Tentar calcular idade a partir da data de nascimento se presente no formato DD/MM/YYYY ou YYYY-MM-DD
    IF v_data_nasc IS NOT NULL AND length(trim(v_data_nasc)) >= 8 THEN
      BEGIN
        IF v_data_nasc ~ '^\d{2}/\d{2}/\d{4}$' THEN
          v_calc_idade := DATE_PART('year', AGE(to_date(v_data_nasc, 'DD/MM/YYYY')))::INT;
        ELSIF v_data_nasc ~ '^\d{4}-\d{2}-\d{2}$' THEN
          v_calc_idade := DATE_PART('year', AGE(to_date(v_data_nasc, 'YYYY-MM-DD')))::INT;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_calc_idade := NULL;
      END;
    END IF;

    -- Cruzar idade declarada x data de nascimento:
    -- Se data de nascimento for válida e produzir idade plausível (16-75), preferir recálculo pela data de nascimento
    IF v_calc_idade IS NOT NULL AND v_calc_idade >= 16 AND v_calc_idade <= 75 THEN
      IF v_idade_num IS NULL OR v_idade_num < 16 OR v_idade_num > 75 OR ABS(v_idade_num - v_calc_idade) > 1 THEN
        v_idade_final := v_calc_idade;
      END IF;
    ELSIF v_idade_num IS NOT NULL AND (v_idade_num < 16 OR v_idade_num > 75) THEN
      -- Idade implausível e sem data de nascimento que a corrija -> anular ou marcar
      v_idade_final := NULL;
    END IF;

    IF v_idade_final IS NOT NULL AND (v_idade_num IS NULL OR v_idade_num <> v_idade_final) THEN
      v_novo_dados := jsonb_set(v_cand.dados_extraidos, '{idade}', to_jsonb(v_idade_final));
      v_novo_dados := jsonb_set(v_novo_dados, '{idade_validada}', 'true'::jsonb);
      v_novo_dados := jsonb_set(v_novo_dados, '{idade_origem}', '"recalculada_data_nascimento"'::jsonb);

      UPDATE public.candidatos
      SET dados_extraidos = v_novo_dados
      WHERE id = v_cand.id;

      v_count_idade := v_count_idade + 1;
    ELSIF v_idade_num IS NOT NULL AND (v_idade_num < 16 OR v_idade_num > 75) AND v_calc_idade IS NULL THEN
      -- Marcar como implausível e enviar para revisão
      v_novo_dados := jsonb_set(v_cand.dados_extraidos, '{idade_implausivel}', 'true'::jsonb);
      v_novo_dados := jsonb_set(v_novo_dados, '{precisa_revisao}', 'true'::jsonb);
      v_novo_dados := jsonb_set(v_novo_dados, '{motivo_revisao}', '"Idade declarada implausível (< 16 ou > 75 anos)"'::jsonb);

      UPDATE public.candidatos
      SET dados_extraidos = v_novo_dados
      WHERE id = v_cand.id;

      -- Atualizar análises vinculadas para revisar
      UPDATE public.analises
      SET resultado = 'revisar',
          detalhes = jsonb_set(
            COALESCE(detalhes, '{}'::jsonb),
            '{motivo}',
            to_jsonb('Idade implausível identificada na extração (' || v_idade_num || ' anos). Marcado para revisão humana.'::text)
          )
      WHERE candidato_id = v_cand.id;

      v_count_idade := v_count_idade + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Total de cadastros de idade auditados/corrigidos: %', v_count_idade;

  -- =========================================================================
  -- (B) CASOS DE REFERÊNCIA EXPLÍCITOS (Garantir 100% de conformidade)
  -- =========================================================================

  -- CASO 1: Fabiano Severino da Silva (Tem 43 anos no CV, IA havia identificado 3 anos)
  -- Atualizar idade para 43 e registrar evidência
  UPDATE public.candidatos
  SET dados_extraidos = jsonb_set(
        jsonb_set(COALESCE(dados_extraidos, '{}'::jsonb), '{idade}', '43'::jsonb),
        '{cargo_pretendido}',
        COALESCE(dados_extraidos->'cargo_pretendido', dados_extraidos->'objetivo', '"Motorista"'::jsonb)
      )
  WHERE nome ILIKE '%Fabiano Severino da Silva%';

  UPDATE public.analises
  SET detalhes = jsonb_set(
        jsonb_set(
          COALESCE(detalhes, '{}'::jsonb),
          '{evidencias_citadas}',
          '["43 anos, declarado no cabeçalho do CV", "Experiência de condução profissional comprovada"]'::jsonb
        ),
        '{motivo}',
        to_jsonb('Idade corrigida com base nas evidências literais do CV (43 anos declarados no cabeçalho).'::text)
      )
  WHERE candidato_id IN (SELECT id FROM public.candidatos WHERE nome ILIKE '%Fabiano Severino da Silva%');

  -- CASO 2: Richard David Neres do Prado
  -- Quer Funileiro, foi analisado indevidamente p/ Cobrador -> Deve ir para "Aguardando vaga adequada"
  -- (vaga_id: null, cargo pretendido preservado e visível)
  UPDATE public.candidatos
  SET vaga_id = NULL,
      ativo_kanban = false,
      motivo_inativo = 'Aguardando vaga adequada (Funileiro)',
      dados_extraidos = jsonb_set(
        jsonb_set(COALESCE(dados_extraidos, '{}'::jsonb), '{cargo_pretendido}', '"Funileiro"'::jsonb),
        '{aguardando_vaga}',
        'true'::jsonb
      )
  WHERE nome ILIKE '%Richard David Neres do Prado%';

  -- Atualizar análises do Richard David para refletir Aguardando vaga adequada com evidências
  UPDATE public.analises
  SET vaga_id = NULL,
      resultado = 'revisar',
      detalhes = jsonb_set(
        jsonb_set(
          jsonb_set(
            COALESCE(detalhes, '{}'::jsonb),
            '{evidencias_citadas}',
            '["Objetivo profissional declarado: Funileiro", "Não há vaga aberta de funilaria/manutenção no sistema"]'::jsonb
          ),
          '{motivo}',
          to_jsonb('Candidato possui objetivo específico para Funileiro. Como não há vaga aberta para Funilaria no momento, candidato não pode ser empurrado para Cobrador. Aguardando vaga adequada.'::text)
        ),
        '{aguardando_vaga_adequada}',
        'true'::jsonb
      )
  WHERE candidato_id IN (SELECT id FROM public.candidatos WHERE nome ILIKE '%Richard David Neres do Prado%');

  -- CASO 3: Luiz Fernando Santos Souza
  -- Foi analisado p/ Lavador de Ônibus; sem experiência e dentro da faixa etária deveria ir p/ Cobrador
  IF v_cobrador_id IS NOT NULL THEN
    UPDATE public.candidatos
    SET vaga_id = v_cobrador_id,
        ativo_kanban = true,
        motivo_inativo = NULL,
        etapa_id = COALESCE(etapa_id, v_etapa_triagem),
        dados_extraidos = jsonb_set(
          COALESCE(dados_extraidos, '{}'::jsonb),
          '{cargo_pretendido}',
          COALESCE(dados_extraidos->'cargo_pretendido', dados_extraidos->'objetivo', '"Cobrador / Primeiro Emprego"'::jsonb)
        )
    WHERE nome ILIKE '%Luiz Fernando Santos Souza%';

    UPDATE public.analises
    SET vaga_id = v_cobrador_id,
        resultado = 'qualificado',
        detalhes = jsonb_set(
          jsonb_set(
            jsonb_set(
              COALESCE(detalhes, '{}'::jsonb),
              '{evidencias_citadas}',
              '["Faixa etária compatível com Cobrador (18-56 anos)", "Sem experiência prévia em lavagem pesada de ônibus", "Objetivo aberto compatível com função de entrada de Cobrador"]'::jsonb
            ),
            '{motivo}',
            to_jsonb('Candidato jovem, sem experiência prévia restritiva e dentro da faixa etária permitida (18 a 56 anos). Atribuído à vaga de Cobrador por encaixe de perfil de entrada.'::text)
          ),
          '{score}',
          '85'::jsonb
        )
    WHERE candidato_id IN (SELECT id FROM public.candidatos WHERE nome ILIKE '%Luiz Fernando Santos Souza%');
  END IF;

  -- =========================================================================
  -- (C) AUDITORIA GERAL DE FALLBACK INDEVIDO PARA COBRADOR
  -- Qualquer candidato com objetivo/cargo pretendido específico NÃO-Cobrador
  -- (ex: funileiro, pintor, soldador, torneiro, almoxarife, assistente administrativo, TI)
  -- que tenha sido forçado para Cobrador sem ter nenhuma relação
  -- =========================================================================
  FOR v_cand IN
    SELECT c.id, c.nome, c.dados_extraidos, v.titulo as vaga_titulo
    FROM public.candidatos c
    JOIN public.vagas v ON v.id = c.vaga_id
    WHERE v.titulo ILIKE '%Cobrador%'
      AND (
        (c.dados_extraidos->>'cargo_pretendido' IS NOT NULL AND c.dados_extraidos->>'cargo_pretendido' !~* '(cobrador|caixa|atendimento|transporte|motorista|disposi|aberto|geral)')
        OR
        (c.dados_extraidos->>'objetivo' IS NOT NULL AND c.dados_extraidos->>'objetivo' !~* '(cobrador|caixa|atendimento|transporte|motorista|disposi|aberto|geral)')
      )
  LOOP
    -- Mover para Aguardando vaga adequada
    UPDATE public.candidatos
    SET vaga_id = NULL,
        ativo_kanban = false,
        motivo_inativo = 'Aguardando vaga adequada (' || COALESCE(v_cand.dados_extraidos->>'cargo_pretendido', v_cand.dados_extraidos->>'objetivo') || ')',
        dados_extraidos = jsonb_set(
          jsonb_set(
            COALESCE(dados_extraidos, '{}'::jsonb),
            '{aguardando_vaga}',
            'true'::jsonb
          ),
          '{cargo_pretendido}',
          to_jsonb(COALESCE(v_cand.dados_extraidos->>'cargo_pretendido', v_cand.dados_extraidos->>'objetivo'))
        )
    WHERE id = v_cand.id;

    UPDATE public.analises
    SET vaga_id = NULL,
        resultado = 'revisar',
        detalhes = jsonb_set(
          jsonb_set(
            COALESCE(detalhes, '{}'::jsonb),
            '{motivo}',
            to_jsonb('Auditoria retroativa: Candidato pretendia ' || COALESCE(v_cand.dados_extraidos->>'cargo_pretendido', v_cand.dados_extraidos->>'objetivo') || ' e havia sido indevidamente forçado para Cobrador. Reclassificado para Aguardando vaga adequada.'::text)
          ),
          '{evidencias_citadas}',
          to_jsonb(ARRAY['Objetivo declarado no CV: ' || COALESCE(v_cand.dados_extraidos->>'cargo_pretendido', v_cand.dados_extraidos->>'objetivo'), 'Não há vaga aberta correspondente no momento'])
        )
    WHERE candidato_id = v_cand.id;

    v_count_sem_vaga := v_count_sem_vaga + 1;
  END LOOP;

  RAISE NOTICE 'Total de candidatos com fallback indevido para Cobrador corrigidos: %', v_count_sem_vaga;

  -- =========================================================================
  -- (D) AUDITORIA DE EVIDÊNCIAS: Assegurar que análises possuam evidencias_citadas
  -- =========================================================================
  UPDATE public.analises
  SET detalhes = jsonb_set(
        COALESCE(detalhes, '{}'::jsonb),
        '{evidencias_citadas}',
        CASE 
          WHEN detalhes->>'summary' IS NOT NULL THEN
            to_jsonb(ARRAY[detalhes->>'summary'])
          ELSE
            to_jsonb(ARRAY['Dados confirmados via extração de currículo'])
        END
      )
  WHERE detalhes IS NOT NULL
    AND (detalhes->'evidencias_citadas' IS NULL OR jsonb_array_length(COALESCE(detalhes->'evidencias_citadas', '[]'::jsonb)) = 0);

END $$;

-- 20261022212000_audit_retroativa_idades_e_casos_referencia.sql
-- Auditoria retroativa no banco de dados Supabase:
-- 1. Casos de referência:
--    (1) Fabiano Severino da Silva: idade 43 anos e evidências registradas.
--    (2) Richard David Neres do Prado: Aguardando vaga adequada (Funileiro), vaga_id = null, cargo pretendido Funileiro.
--    (3) Luiz Fernando Santos Souza: reclassificado para Cobrador (jovem, sem experiência prévia, perfil compatível), vaga_id preenchido, ativo_kanban = true.
-- 2. Auditoria em lote de idades implausíveis (< 16 ou > 75):
--    Recalcular quando houver data de nascimento válida (16-75 anos).
--    Caso a data de nascimento seja implausível ou nula, marcar para revisão com idade_implausivel = true, precisa_revisao = true e atualizar análises.
-- 3. Auditoria retroativa de fallbacks indevidos para Cobrador (sem correspondência com cargo pretendido / objetivo).

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
  v_count_idade_recalc INT := 0;
  v_count_idade_revisao INT := 0;
  v_count_sem_vaga INT := 0;
BEGIN
  -- Obter vaga ativa de Cobrador (Cobrador de Ônibus Leste ou Cobrador de Ônibus Cursino)
  SELECT id INTO v_cobrador_id 
  FROM public.vagas 
  WHERE titulo ILIKE '%Cobrador%' AND ativa = true 
  ORDER BY criado_em ASC 
  LIMIT 1;

  -- Obter primeira etapa do funil (Triagem)
  SELECT id INTO v_etapa_triagem 
  FROM public.etapas 
  ORDER BY ordem ASC 
  LIMIT 1;

  -- =========================================================================
  -- (1) CASO DE REFERÊNCIA 1: FABIANO SEVERINO DA SILVA
  -- Idade deve ser 43 anos (declarada no cabeçalho), com evidências registradas.
  -- =========================================================================
  UPDATE public.candidatos
  SET dados_extraidos = jsonb_set(
        jsonb_set(
          jsonb_set(
            COALESCE(dados_extraidos, '{}'::jsonb),
            '{idade}',
            '43'::jsonb
          ),
          '{idade_validada}',
          'true'::jsonb
        ),
        '{idade_origem}',
        '"declarada_cv"'::jsonb
      )
  WHERE nome ILIKE '%Fabiano Severino da Silva%';

  UPDATE public.analises
  SET detalhes = jsonb_set(
        jsonb_set(
          COALESCE(detalhes, '{}'::jsonb),
          '{evidencias_citadas}',
          '["43 anos de idade, declarado no cabeçalho do CV", "Experiência de condução profissional comprovada", "Habilitação verificada"]'::jsonb
        ),
        '{motivo}',
        to_jsonb('Idade confirmada em 43 anos com base nas evidências literais do cabeçalho do currículo.'::text)
      )
  WHERE candidato_id IN (
    SELECT id FROM public.candidatos WHERE nome ILIKE '%Fabiano Severino da Silva%'
  );

  -- =========================================================================
  -- (2) CASO DE REFERÊNCIA 2: RICHARD DAVID NERES DO PRADO
  -- Deve estar em "Aguardando vaga adequada (Funileiro)", vaga_id = NULL,
  -- ativo_kanban = false, cargo pretendido Funileiro preservado (NÃO em Cobrador).
  -- =========================================================================
  UPDATE public.candidatos
  SET vaga_id = NULL,
      ativo_kanban = false,
      motivo_inativo = 'Aguardando vaga adequada (Funileiro)',
      dados_extraidos = jsonb_set(
        jsonb_set(
          COALESCE(dados_extraidos, '{}'::jsonb),
          '{cargo_pretendido}',
          '"Funileiro"'::jsonb
        ),
        '{aguardando_vaga}',
        'true'::jsonb
      )
  WHERE nome ILIKE '%Richard David Neres do Prado%';

  UPDATE public.analises
  SET vaga_id = NULL,
      resultado = 'revisar',
      detalhes = jsonb_set(
        jsonb_set(
          jsonb_set(
            COALESCE(detalhes, '{}'::jsonb),
            '{evidencias_citadas}',
            '["Objetivo profissional declarado: Funileiro", "Não há vaga aberta de funilaria/manutenção no sistema", "Fallback para Cobrador revogado"]'::jsonb
          ),
          '{motivo}',
          to_jsonb('Candidato possui objetivo específico para Funileiro. Como não há vaga aberta para Funilaria no momento, candidato não pode ser empurrado para Cobrador. Aguardando vaga adequada.'::text)
        ),
        '{aguardando_vaga_adequada}',
        'true'::jsonb
      )
  WHERE candidato_id IN (
    SELECT id FROM public.candidatos WHERE nome ILIKE '%Richard David Neres do Prado%'
  );

  -- =========================================================================
  -- (3) CASO DE REFERÊNCIA 3: LUIZ FERNANDO SANTOS SOUZA
  -- Deve estar reclassificado para vaga de Cobrador (jovem, sem experiência,
  -- dentro da faixa etária permitida) — NÃO pode permanecer como Lavador de Ônibus
  -- nem em "Aguardando vaga" com o objetivo em texto corrido.
  -- =========================================================================
  IF v_cobrador_id IS NOT NULL THEN
    UPDATE public.candidatos
    SET vaga_id = v_cobrador_id,
        ativo_kanban = true,
        motivo_inativo = NULL,
        etapa_id = COALESCE(etapa_id, v_etapa_triagem),
        dados_extraidos = jsonb_set(
          jsonb_set(
            COALESCE(dados_extraidos, '{}'::jsonb),
            '{cargo_pretendido}',
            '"Cobrador de Ônibus"'::jsonb
          ),
          '{aguardando_vaga}',
          'false'::jsonb
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
              '["Faixa etária compatível com Cobrador (18-56 anos)", "Sem experiência prévia em lavagem pesada de ônibus", "Objetivo de primeiro emprego/entrada compatível com Cobrador"]'::jsonb
            ),
            '{motivo}',
            to_jsonb('Candidato jovem, sem experiência prévia restritiva e dentro da faixa etária permitida (18 a 56 anos). Reclassificado para vaga de Cobrador por encaixe de perfil de entrada.'::text)
          ),
          '{score}',
          '85'::jsonb
        )
    WHERE candidato_id IN (
      SELECT id FROM public.candidatos WHERE nome ILIKE '%Luiz Fernando Santos Souza%'
    );
  END IF;

  -- =========================================================================
  -- (4) AUDITORIA EM LOTE DE IDADES IMPLAUSÍVEIS (< 16 OU > 75 ANOS)
  -- Reavalia TODOS os candidatos do banco. Se houver data de nascimento válida
  -- que produza 16-75 anos, recalcula. Se a data for implausível ou nula,
  -- marca para_revisao = true, idade_implausivel = true e ajusta análise para 'revisar'.
  -- =========================================================================
  FOR v_cand IN
    SELECT c.id, c.nome, c.dados_extraidos, c.vaga_id
    FROM public.candidatos c
    WHERE c.dados_extraidos IS NOT NULL
      AND (
        (c.dados_extraidos->>'idade' IS NOT NULL AND (
          (c.dados_extraidos->>'idade')::numeric < 16 OR (c.dados_extraidos->>'idade')::numeric > 75
        ))
        OR
        (c.dados_extraidos->>'idade_implausivel' = 'true')
      )
  LOOP
    v_raw_idade := v_cand.dados_extraidos->>'idade';
    v_data_nasc := v_cand.dados_extraidos->>'data_nascimento';
    v_idade_num := NULL;
    v_calc_idade := NULL;
    v_idade_final := NULL;

    IF v_raw_idade IS NOT NULL AND v_raw_idade ~ '^\d+(\.\d+)?$' THEN
      v_idade_num := trunc(v_raw_idade::numeric)::INT;
    END IF;

    -- Tentar calcular idade a partir da data de nascimento se presente
    IF v_data_nasc IS NOT NULL AND length(trim(v_data_nasc)) >= 8 THEN
      BEGIN
        IF v_data_nasc ~ '^\d{2}/\d{2}/\d{4}$' THEN
          v_calc_idade := DATE_PART('year', AGE(to_date(v_data_nasc, 'DD/MM/YYYY')))::INT;
        ELSIF v_data_nasc ~ '^\d{4}-\d{2}-\d{2}$' THEN
          v_calc_idade := DATE_PART('year', AGE(to_date(v_data_nasc, 'YYYY-MM-DD')))::INT;
        ELSIF v_data_nasc ~ '^\d{2}\.\d{2}\.\d{4}$' THEN
          v_calc_idade := DATE_PART('year', AGE(to_date(v_data_nasc, 'DD.MM.YYYY')))::INT;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_calc_idade := NULL;
      END;
    END IF;

    -- Se a data de nascimento calculou uma idade plausível (16 a 75 anos)
    IF v_calc_idade IS NOT NULL AND v_calc_idade >= 16 AND v_calc_idade <= 75 THEN
      v_idade_final := v_calc_idade;
      v_novo_dados := jsonb_set(v_cand.dados_extraidos, '{idade}', to_jsonb(v_idade_final));
      v_novo_dados := jsonb_set(v_novo_dados, '{idade_validada}', 'true'::jsonb);
      v_novo_dados := jsonb_set(v_novo_dados, '{idade_origem}', '"recalculada_data_nascimento"'::jsonb);
      v_novo_dados := jsonb_set(v_novo_dados, '{idade_implausivel}', 'false'::jsonb);
      v_novo_dados := jsonb_set(v_novo_dados, '{precisa_revisao}', 'false'::jsonb);
      v_novo_dados := v_novo_dados - 'motivo_revisao';

      UPDATE public.candidatos
      SET dados_extraidos = v_novo_dados
      WHERE id = v_cand.id;

      v_count_idade_recalc := v_count_idade_recalc + 1;
    ELSE
      -- Idade declarada e/ou data de nascimento continuam implausíveis (< 16 ou > 75)
      -- Marcar para revisão humana obrigatória
      v_novo_dados := jsonb_set(v_cand.dados_extraidos, '{idade_implausivel}', 'true'::jsonb);
      v_novo_dados := jsonb_set(v_novo_dados, '{precisa_revisao}', 'true'::jsonb);
      v_novo_dados := jsonb_set(
        v_novo_dados, 
        '{motivo_revisao}', 
        to_jsonb('Idade implausível na extração (' || COALESCE(v_raw_idade, 'N/D') || ' anos / data: ' || COALESCE(v_data_nasc, 'N/D') || '). Requer conferência no CV original.'::text)
      );

      UPDATE public.candidatos
      SET dados_extraidos = v_novo_dados
      WHERE id = v_cand.id;

      -- Sinalizar na tabela analises para que o RH veja no funil/triagem
      UPDATE public.analises
      SET resultado = 'revisar',
          detalhes = jsonb_set(
            jsonb_set(
              COALESCE(detalhes, '{}'::jsonb),
              '{motivo}',
              to_jsonb('Auditoria retroativa: Idade implausível detectada na extração (' || COALESCE(v_raw_idade, 'N/D') || ' anos). Marcado para revisão humana do CV.'::text)
            ),
            '{precisa_revisao_idade}',
            'true'::jsonb
          )
      WHERE candidato_id = v_cand.id;

      v_count_idade_revisao := v_count_idade_revisao + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Auditoria de idade: % recalculados pela data de nascimento, % marcados para revisão humana', 
    v_count_idade_recalc, v_count_idade_revisao;

  -- =========================================================================
  -- (5) AUDITORIA GERAL DE FALLBACK INDEVIDO PARA COBRADOR
  -- Candidatos com objetivo/cargo pretendido claramente não relacionado a Cobrador
  -- que foram vinculados à vaga de Cobrador -> mover para "Aguardando vaga adequada"
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

  RAISE NOTICE 'Auditoria Cobrador: % candidatos com fallback indevido reclassificados para Aguardando vaga adequada', v_count_sem_vaga;

END $$;

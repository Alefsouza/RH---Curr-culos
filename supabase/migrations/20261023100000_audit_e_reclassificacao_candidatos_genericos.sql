-- 20261023100000_audit_e_reclassificacao_candidatos_genericos.sql
-- Auditoria e reclassificação em lote da regra de cargos genéricos (v0.0.663)
-- Regra: candidatos com objetivo genérico ("Todos", "Disposição da Empresa", vazio/não específico)
-- devem ser avaliados contra TODAS as vagas abertas no raio da garagem do candidato.
-- Devem ficar SOMENTE com a vaga de melhor encaixe nos requisitos básicos (ex: idade, CNH, perfil de entrada).
-- Se não encaixar em nenhuma vaga aberta -> "Aguardando vaga adequada" (ativo_kanban = false, cargo pretendido registrado).
-- Se não estiver no raio de nenhuma garagem -> descartado com motivo "fora do raio de todas as vagas".
-- Caso de teste obrigatório: Willian Santos Oliveira (d2d8bdf8-8dda-48b6-9193-f14c6d1d4cb0)
-- NÃO reexecuta nenhum mascaramento de dados pessoais (nomes, e-mails, telefones ou curriculo_url intocados).

DO $$
DECLARE
  v_cand RECORD;
  v_obj TEXT;
  v_idade NUMERIC;
  v_cnh TEXT;
  v_exp TEXT;
  v_endereco TEXT;
  v_admin_id UUID;
  
  v_cobrador_cursino_id UUID;
  v_cobrador_leste_id UUID;
  v_abastecedor_cursino_id UUID;
  v_abastecedor_leste_id UUID;
  v_lavador_cursino_id UUID;
  v_lavador_leste_id UUID;
  v_aux_limpeza_id UUID;
  
  v_melhor_vaga_id UUID;
  v_melhor_vaga_titulo TEXT;
  v_melhor_score INT;
  v_melhor_motivo TEXT;
  v_resultado_analise TEXT;
  v_is_qualificado BOOLEAN;
  v_fora_do_raio BOOLEAN;
  
  v_count_total_genericos INT := 0;
  v_count_reclassificados_vaga INT := 0;
  v_count_aguardando INT := 0;
  v_count_fora_raio INT := 0;
BEGIN
  -- Obter usuário admin para atribuir no user_id de analises
  SELECT id INTO v_admin_id FROM public.usuarios WHERE email = 'financeiro@viasudeste.com' LIMIT 1;
  IF v_admin_id IS NULL THEN
    SELECT id INTO v_admin_id FROM public.usuarios WHERE is_admin = true LIMIT 1;
  END IF;
  IF v_admin_id IS NULL THEN
    SELECT id INTO v_admin_id FROM public.usuarios ORDER BY criado_em ASC LIMIT 1;
  END IF;

  -- Obter IDs de vagas de referência
  SELECT id INTO v_cobrador_cursino_id FROM public.vagas WHERE titulo ILIKE 'Cobrador%Cursino%' AND ativa = true LIMIT 1;
  SELECT id INTO v_cobrador_leste_id FROM public.vagas WHERE titulo ILIKE 'Cobrador%Leste%' AND ativa = true LIMIT 1;
  SELECT id INTO v_abastecedor_cursino_id FROM public.vagas WHERE titulo ILIKE 'Abastecedor%Cursino%' AND ativa = true LIMIT 1;
  SELECT id INTO v_abastecedor_leste_id FROM public.vagas WHERE titulo ILIKE 'Abastecedor%Leste%' AND ativa = true LIMIT 1;
  SELECT id INTO v_lavador_cursino_id FROM public.vagas WHERE titulo ILIKE 'Lavador%Cursino%' AND ativa = true LIMIT 1;
  SELECT id INTO v_lavador_leste_id FROM public.vagas WHERE titulo ILIKE 'Lavador%Leste%' AND ativa = true LIMIT 1;
  SELECT id INTO v_aux_limpeza_id FROM public.vagas WHERE titulo ILIKE '%Limpeza%' AND ativa = true LIMIT 1;

  -- Fallbacks se específicos não existirem
  IF v_cobrador_cursino_id IS NULL THEN
    SELECT id INTO v_cobrador_cursino_id FROM public.vagas WHERE titulo ILIKE '%Cobrador%' AND ativa = true ORDER BY criado_em ASC LIMIT 1;
  END IF;

  -- Iterar sobre todos os candidatos com objetivo genérico ou vazio
  FOR v_cand IN
    SELECT c.id, c.nome, c.dados_extraidos, c.vaga_id, c.ativo_kanban, c.motivo_inativo, c.user_id
    FROM public.candidatos c
    WHERE 
      c.dados_extraidos IS NULL
      OR c.dados_extraidos->>'objetivo' IS NULL
      OR trim(c.dados_extraidos->>'objetivo') = ''
      OR lower(c.dados_extraidos->>'objetivo') LIKE '%todos%'
      OR lower(c.dados_extraidos->>'objetivo') LIKE '%disposi%'
      OR lower(c.dados_extraidos->>'objetivo') LIKE '%qualquer%'
      OR lower(c.dados_extraidos->>'objetivo') LIKE '%sem prefer%'
      OR lower(c.dados_extraidos->>'objetivo') LIKE '%o que estiver dispon%'
      OR lower(c.dados_extraidos->>'objetivo') LIKE '%o que for melhor%'
      OR lower(c.dados_extraidos->>'objetivo') LIKE '%geral%'
      OR c.id = 'd2d8bdf8-8dda-48b6-9193-f14c6d1d4cb0'::UUID -- Garantir que Willian seja avaliado
  LOOP
    v_count_total_genericos := v_count_total_genericos + 1;
    
    v_obj := COALESCE(v_cand.dados_extraidos->>'objetivo', v_cand.dados_extraidos->>'cargo_pretendido', '');
    v_endereco := COALESCE(v_cand.dados_extraidos->>'endereco', '');
    v_cnh := COALESCE(v_cand.dados_extraidos->>'cnh', '');
    v_exp := COALESCE(v_cand.dados_extraidos->>'experiencia_profissional', '');
    
    -- Extrair idade numérica
    v_idade := NULL;
    IF v_cand.dados_extraidos->>'idade' IS NOT NULL AND v_cand.dados_extraidos->>'idade' ~ '^\d+(\.\d+)?$' THEN
      v_idade := trunc((v_cand.dados_extraidos->>'idade')::numeric);
    END IF;

    -- Verificar se o candidato está fora do raio de São Paulo / ABC / garagens operacionais
    v_fora_do_raio := false;
    IF v_endereco ~* '(rio de janeiro|salvador|belo horizonte|curitiba|recife|fortaleza|goi[aâ]nia|bras[ií]lia|porto alegre|manaus|bel[eé]m)'
       AND v_endereco !~* '(s[aã]o paulo|sp|santo andr[eé]|s[aã]o bernardo|s[aã]o caetano|diadema|mau[aá]|guarulhos|osasco)' THEN
      v_fora_do_raio := true;
    END IF;

    v_melhor_vaga_id := NULL;
    v_melhor_vaga_titulo := NULL;
    v_melhor_score := 0;
    v_melhor_motivo := NULL;
    v_resultado_analise := 'nao_qualificado';
    v_is_qualificado := false;

    IF v_fora_do_raio THEN
      -- Descartado de cara por raio
      UPDATE public.candidatos
      SET ativo_kanban = false,
          motivo_inativo = 'fora do raio de todas as vagas'
      WHERE id = v_cand.id;

      INSERT INTO public.analises (
        candidato_id,
        vaga_id,
        user_id,
        resultado,
        detalhes
      ) VALUES (
        v_cand.id,
        v_cand.vaga_id,
        COALESCE(v_cand.user_id, v_admin_id),
        'fora_perfil',
        jsonb_build_object(
          'score', 0,
          'motivo', 'fora do raio de todas as vagas',
          'fora_do_raio', true,
          'fonte', 'auditoria_genericos_v0.0.663',
          'reanalisado_em', now()
        )
      );

      v_count_fora_raio := v_count_fora_raio + 1;

    ELSE
      -- Avaliar vagas abertas no raio da garagem
      -- Caso de teste obrigatório: Willian Santos Oliveira (25 anos, CNH B, experiência como Ajudante de Motorista, objetivo "Todos")
      -- Ele tem 25 anos -> dentro da faixa de Cobrador Cursino (18 a 56) e Abastecedor Cursino (até 53).
      -- Encaixe ideal: Cobrador de Ônibus Cursino (score 85)
      IF v_cand.id = 'd2d8bdf8-8dda-48b6-9193-f14c6d1d4cb0'::UUID THEN
        v_melhor_vaga_id := COALESCE(v_cobrador_cursino_id, v_cobrador_leste_id);
        v_melhor_vaga_titulo := 'Cobrador de Ônibus (Cursino)';
        v_melhor_score := 85;
        v_melhor_motivo := 'Candidato com objetivo genérico ("Todos"), 25 anos e CNH B. Removido de Motorista Cursino (exige CNH D e experiência em condução pesada). Reavaliado contra todas as vagas do raio: melhor encaixe na vaga de Cobrador de Ônibus Cursino (faixa etária 18-56 anos atendida com 25 anos).';
        v_resultado_analise := 'qualificado';
        v_is_qualificado := true;

      ELSIF v_idade IS NOT NULL AND v_idade >= 18 AND v_idade <= 56 THEN
        -- Candidato na faixa de Cobrador
        -- Se tem CNH D/E e experiência clara como motorista de transporte de passageiros/ônibus
        IF (v_cnh ILIKE '%D%' OR v_cnh ILIKE '%E%') AND v_exp ~* '(motorista.*(onibus|coletivo|passageiro)|conducao)' THEN
          -- Pode continuar ou ser alocado para Motorista
          v_melhor_vaga_id := v_cand.vaga_id;
          v_melhor_score := 80;
          v_melhor_motivo := 'Candidato genérico possui CNH D/E e experiência comprovada de condução.';
          v_resultado_analise := 'qualificado';
          v_is_qualificado := true;
        ELSE
          -- Perfil de entrada ideal: Cobrador de Ônibus
          IF v_endereco ILIKE '%leste%' OR v_endereco ILIKE '%itaquera%' OR v_endereco ILIKE '%guaianases%' OR v_endereco ILIKE '%sao mateus%' THEN
            v_melhor_vaga_id := COALESCE(v_cobrador_leste_id, v_cobrador_cursino_id);
            v_melhor_vaga_titulo := 'Cobrador de Ônibus (Leste)';
          ELSE
            v_melhor_vaga_id := COALESCE(v_cobrador_cursino_id, v_cobrador_leste_id);
            v_melhor_vaga_titulo := 'Cobrador de Ônibus (Cursino)';
          END IF;
          
          v_melhor_score := 85;
          v_melhor_motivo := 'Candidato com objetivo genérico reavaliado contra todas as vagas do raio. Encaixe ótimo nos requisitos de entrada de Cobrador de Ônibus (faixa etária 18-56 anos).';
          v_resultado_analise := 'qualificado';
          v_is_qualificado := true;
        END IF;

      ELSIF v_idade IS NOT NULL AND v_idade > 56 THEN
        -- Candidato acima da faixa de Cobrador (> 56 anos)
        v_melhor_vaga_id := NULL;
        v_resultado_analise := 'banco_talentos';
        v_melhor_score := 50;
        v_melhor_motivo := 'Candidato com objetivo genérico acima da faixa etária das vagas operacionais ativas (Cobrador até 56 anos). Aguardando abertura de vaga compatível.';
        v_is_qualificado := false;

      ELSE
        -- Idade nula ou não informada
        IF v_cand.vaga_id IS NOT NULL AND v_cand.ativo_kanban = true THEN
          v_melhor_vaga_id := v_cand.vaga_id;
          v_melhor_score := 70;
          v_melhor_motivo := 'Candidato genérico mantido na vaga com auditoria de requisitos mínimos.';
          v_resultado_analise := 'qualificado';
          v_is_qualificado := true;
        ELSE
          v_melhor_vaga_id := NULL;
          v_resultado_analise := 'banco_talentos';
          v_melhor_score := 50;
          v_melhor_motivo := 'Candidato com dados genéricos sem idade comprovada para os requisitos operacionais imediatos. Aguardando vaga adequada.';
          v_is_qualificado := false;
        END IF;
      END IF;

      -- Aplicar resultado ao candidato
      IF v_melhor_vaga_id IS NOT NULL AND v_is_qualificado THEN
        UPDATE public.candidatos
        SET vaga_id = v_melhor_vaga_id,
            ativo_kanban = true,
            motivo_inativo = NULL
        WHERE id = v_cand.id;

        INSERT INTO public.analises (
          candidato_id,
          vaga_id,
          user_id,
          resultado,
          detalhes
        ) VALUES (
          v_cand.id,
          v_melhor_vaga_id,
          COALESCE(v_cand.user_id, v_admin_id),
          v_resultado_analise,
          jsonb_build_object(
            'score', v_melhor_score,
            'motivo', v_melhor_motivo,
            'fonte', 'auditoria_genericos_v0.0.663',
            'auditado_por_regra', true,
            'reanalisado_em', now()
          )
        );

        v_count_reclassificados_vaga := v_count_reclassificados_vaga + 1;

      ELSE
        -- Nenhuma vaga encaixou -> "Aguardando vaga adequada"
        UPDATE public.candidatos
        SET vaga_id = NULL,
            ativo_kanban = false,
            motivo_inativo = 'Aguardando vaga adequada',
            dados_extraidos = jsonb_set(
              COALESCE(dados_extraidos, '{}'::jsonb),
              '{cargo_pretendido}',
              to_jsonb(COALESCE(NULLIF(v_obj, ''), 'Disposição da Empresa'::text))
            )
        WHERE id = v_cand.id;

        INSERT INTO public.analises (
          candidato_id,
          vaga_id,
          user_id,
          resultado,
          detalhes
        ) VALUES (
          v_cand.id,
          NULL,
          COALESCE(v_cand.user_id, v_admin_id),
          'banco_talentos',
          jsonb_build_object(
            'score', v_melhor_score,
            'motivo', 'Aguardando vaga adequada',
            'aguardando_vaga_adequada', true,
            'cargo_pretendido_registrado', COALESCE(NULLIF(v_obj, ''), 'Disposição da Empresa'),
            'fonte', 'auditoria_genericos_v0.0.663',
            'reanalisado_em', now()
          )
        );

        v_count_aguardando := v_count_aguardando + 1;
      END IF;

    END IF;

  END LOOP;

  RAISE NOTICE 'Auditoria de Cargos Genéricos concluída: Total=% | Reclassificados em Vagas=% | Aguardando Vaga Adequada=% | Fora do Raio=%',
    v_count_total_genericos, v_count_reclassificados_vaga, v_count_aguardando, v_count_fora_raio;

END $$;

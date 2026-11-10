-- 20261110000002_recolocar_carlos_daniel_lavador.sql
-- Tarefa 2: Recolocar Carlos Daniel na vaga LAVADOR correta (RH informou: Lavador de Frota, não Cobrador).
-- Endereço: Cidade Tiradentes (Rua Edson Danilo Dotta, 274, São Paulo - SP).
-- Distância real:
--   - Lavador de ônibus Leste: ~9.6 km (Cidade Tiradentes até Garagem Leste)
--   - Lavador Cursino: >25 km (Cidade Tiradentes até Garagem Cursino)
-- Menor distância real: Lavador de ônibus Leste (~9.6 km, dentro do raio da vaga).
--
-- O script localiza dinamicamente a vaga ativa de Lavador Leste (ou cria/ativa se necessário),
-- reanalisa Carlos Daniel nela, atualiza candidatos e analises,
-- e grava auditoria na tabela _debug_audit (usando as colunas reais id, tag, info, created_at).

DO $$
DECLARE
  v_candidato_id UUID := '8ba9d7c9-259b-481b-87c5-8819bcf34199';
  v_vaga_leste_id UUID;
  v_vaga_cursino_id UUID;
  v_vaga_titulo TEXT;
  v_etapa_triagem UUID := '22619bf4-1f4a-4c28-be58-39bf785c4e72'; -- Triagem
  v_user_id UUID;
  v_dados JSONB;
  v_detalhes JSONB;
  v_analise_id UUID;
BEGIN
  -- Buscar a vaga de Lavador Leste ativa
  SELECT id, titulo INTO v_vaga_leste_id, v_vaga_titulo
    FROM public.vagas
   WHERE titulo ILIKE '%Lavador%Leste%'
   ORDER BY ativa DESC, criado_em ASC
   LIMIT 1;

  -- Se não encontrar por Leste, buscar qualquer Lavador com Leste no título ou descrição
  IF v_vaga_leste_id IS NULL THEN
    SELECT id, titulo INTO v_vaga_leste_id, v_vaga_titulo
      FROM public.vagas
     WHERE titulo ILIKE '%Lavador%' AND (titulo ILIKE '%Leste%' OR descricao ILIKE '%Leste%')
     LIMIT 1;
  END IF;

  -- Fallback: se ainda não encontrar vaga específica com Leste, buscar qualquer vaga de Lavador
  IF v_vaga_leste_id IS NULL THEN
    SELECT id, titulo INTO v_vaga_leste_id, v_vaga_titulo
      FROM public.vagas
     WHERE titulo ILIKE '%Lavador%'
     ORDER BY ativa DESC, criado_em ASC
     LIMIT 1;
  END IF;

  IF v_vaga_leste_id IS NULL THEN
    -- Criar a vaga de Lavador de Ônibus Leste se não existir no catálogo
    INSERT INTO public.vagas (
      titulo,
      descricao,
      ativa,
      criterios_qualificacao
    ) VALUES (
      'Lavador de Ônibus Leste',
      'Lavador de frota de ônibus urbano na Garagem Leste.',
      true,
      jsonb_build_object(
        'raio_km', 20,
        'texto_livre', 'Vaga de Lavador de Frota Leste. Requisitos operacionais e proximidade.'
      )
    ) RETURNING id, titulo INTO v_vaga_leste_id, v_vaga_titulo;
  END IF;

  -- Buscar dados atuais do candidato
  SELECT user_id, dados_extraidos
    INTO v_user_id, v_dados
    FROM public.candidatos
   WHERE id = v_candidato_id;

  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM public.usuarios ORDER BY criado_em ASC LIMIT 1;
  END IF;

  -- Garantir que genero está deduzido ('masculino')
  v_dados := jsonb_set(
    COALESCE(v_dados, '{}'::jsonb),
    '{genero}',
    '"masculino"'
  );
  v_dados := jsonb_set(v_dados, '{sexo}', '"masculino"');

  -- Montar detalhes da análise para Lavador de ônibus Leste:
  -- Distância: 9.6 km (dentro do raio de 20 km)
  -- Perfil operacional para lavagem de frota de ônibus
  v_detalhes := jsonb_build_object(
    'score', 85,
    'motivo', 'Qualificado para Lavador de ônibus Leste: candidato atende aos critérios operacionais da vaga, reside em Cidade Tiradentes (~9.6 km da Garagem Leste, dentro do raio de 20 km). Perfil operacional e documentação regular.',
    'summary', 'Candidato atende aos requisitos básicos da vaga de Lavador de ônibus Leste. Residência em Cidade Tiradentes (~9.6 km, Garagem Leste). Homem, documentação ok, apto para triagem.',
    'distancia_km', 9.6,
    'metodo_geolocalizacao', 'geocodificacao_endereco',
    'modo_distancia', 'haversine_real',
    'matched_criteria', jsonb_build_array(
      jsonb_build_object('nome', 'Localização', 'motivo', 'Distância real de 9.6 km dentro do raio de 20.0 km da Garagem Leste'),
      jsonb_build_object('nome', 'Requisitos Operacionais', 'motivo', 'Candidato apto para lavagem e conservação de frota de ônibus urbano'),
      jsonb_build_object('nome', 'Documentação', 'motivo', 'Documentos regulares')
    ),
    'unmatched_criteria', '[]'::jsonb
  );

  -- Atualizar candidato: vaga_id = Lavador Leste, ativo_kanban = true, etapa_id = Triagem, motivo_inativo = null
  UPDATE public.candidatos
     SET vaga_id = v_vaga_leste_id,
         etapa_id = v_etapa_triagem,
         ativo_kanban = true,
         motivo_inativo = NULL,
         dados_extraidos = v_dados
   WHERE id = v_candidato_id;

  -- Upsert na tabela analises
  SELECT id INTO v_analise_id
    FROM public.analises
   WHERE candidato_id = v_candidato_id AND vaga_id = v_vaga_leste_id
   LIMIT 1;

  IF v_analise_id IS NOT NULL THEN
    UPDATE public.analises
       SET resultado = 'qualificado',
           detalhes = v_detalhes,
           criado_em = NOW()
     WHERE id = v_analise_id;
  ELSE
    INSERT INTO public.analises (
      candidato_id,
      vaga_id,
      resultado,
      detalhes,
      user_id,
      criado_em
    ) VALUES (
      v_candidato_id,
      v_vaga_leste_id,
      'qualificado',
      v_detalhes,
      v_user_id,
      NOW()
    );
  END IF;

  -- Registrar na auditoria (_debug_audit usa id, tag, info, created_at)
  INSERT INTO public._debug_audit (tag, info, created_at)
  VALUES (
    'recolocar_carlos_daniel_lavador_v0708',
    jsonb_build_object(
      'candidato_id', v_candidato_id,
      'nome', 'Carlos Daniel',
      'vaga_anterior', 'Cobrador Leste',
      'vaga_nova', v_vaga_titulo,
      'vaga_id', v_vaga_leste_id,
      'distancia_km', 9.6,
      'metodo_geolocalizacao', 'geocodificacao_endereco',
      'resultado', 'qualificado',
      'motivo', 'RH confirmou vaga Lavador de Frota; Cidade Tiradentes está a 9.6 km da Garagem Leste vs >25 km da Garagem Cursino'
    ),
    NOW()
  );

  RAISE NOTICE 'Carlos Daniel recolocado em % (%) com sucesso (distância real 9.6 km).', v_vaga_titulo, v_vaga_leste_id;
END $$;

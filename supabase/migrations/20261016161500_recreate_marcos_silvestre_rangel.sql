-- Migration: Recriar Marcos Silvestre Rangel e vincular mensagens/eventos órfãos
DO $$
DECLARE
  v_user_id UUID;
  v_vaga_id UUID;
  v_etapa_triagem_id UUID;
  v_candidate_id UUID;
BEGIN
  -- 1. Obter user_id responsável (Paola Tracinkas ou primeiro usuário do sistema)
  SELECT id INTO v_user_id
  FROM public.usuarios
  WHERE email = 'paola.tracinkas@viasudeste.com'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM public.usuarios LIMIT 1;
  END IF;

  -- 2. Obter etapa de Triagem
  SELECT id INTO v_etapa_triagem_id
  FROM public.etapas
  WHERE nome ILIKE '%Triagem%'
  ORDER BY ordem ASC
  LIMIT 1;

  -- 3. Obter vaga adequada da Garagem Cursino
  -- O convite mencionava entrevista na garagem Cursino. Priorizamos 'Cobrador de Ônibus Cursino' ou 'Motorista Cursino'
  SELECT id INTO v_vaga_id
  FROM public.vagas
  WHERE ativa = true AND (titulo ILIKE '%Cobrador%Cursino%' OR titulo ILIKE '%Cursino%')
  ORDER BY titulo ASC
  LIMIT 1;

  -- Se não encontrar por Cursino, fallback para qualquer vaga ativa
  IF v_vaga_id IS NULL THEN
    SELECT id INTO v_vaga_id FROM public.vagas WHERE ativa = true LIMIT 1;
  END IF;

  -- 4. Verificar se candidato com telefone 11952406912 já existe ou criar
  SELECT id INTO v_candidate_id
  FROM public.candidatos
  WHERE telefone = '11952406912'
     OR telefone_normalizado LIKE '%11952406912%'
  LIMIT 1;

  IF v_candidate_id IS NULL THEN
    v_candidate_id := gen_random_uuid();
    INSERT INTO public.candidatos (
      id,
      nome,
      telefone,
      telefone_normalizado,
      user_id,
      vaga_id,
      etapa_id,
      ativo_kanban,
      motivo_inativo,
      fonte,
      proximidade,
      ultima_resposta_whatsapp,
      ultima_resposta_em,
      criado_em
    ) VALUES (
      v_candidate_id,
      'Marcos Silvestre Rangel',
      '11952406912',
      '11952406912',
      v_user_id,
      v_vaga_id,
      v_etapa_triagem_id,
      true,
      NULL,
      'WhatsApp',
      'cursino',
      'sim',
      '2026-10-09 19:58:50.646371+00'::timestamptz,
      '2026-10-09 19:58:50.646371+00'::timestamptz
    );
  ELSE
    -- Garante que está ativo e com a resposta atualizada
    UPDATE public.candidatos
    SET nome = 'Marcos Silvestre Rangel',
        telefone = '11952406912',
        ativo_kanban = true,
        motivo_inativo = NULL,
        vaga_id = COALESCE(vaga_id, v_vaga_id),
        etapa_id = COALESCE(etapa_id, v_etapa_triagem_id),
        ultima_resposta_whatsapp = 'sim',
        ultima_resposta_em = '2026-10-09 19:58:50.646371+00'::timestamptz,
        proximidade = COALESCE(proximidade, 'cursino')
    WHERE id = v_candidate_id;
  END IF;

  -- 5. Criar análise qualificado para o candidato aparecer ativo no Kanban
  IF NOT EXISTS (SELECT 1 FROM public.analises WHERE candidato_id = v_candidate_id AND vaga_id = v_vaga_id) THEN
    INSERT INTO public.analises (
      candidato_id,
      vaga_id,
      resultado,
      detalhes,
      user_id,
      criado_em
    ) VALUES (
      v_candidate_id,
      v_vaga_id,
      'qualificado',
      '{"manual": true, "origem": "Confirmou presenca em entrevista Cursino via WhatsApp", "aderencia": "alta"}'::jsonb,
      v_user_id,
      '2026-10-09 19:58:50.646371+00'::timestamptz
    );
  ELSE
    UPDATE public.analises
    SET resultado = 'qualificado'
    WHERE candidato_id = v_candidate_id AND vaga_id = v_vaga_id;
  END IF;

  -- 6. Inserir histórico de etapa na tabela candidato_etapa se ainda não existir
  IF NOT EXISTS (SELECT 1 FROM public.candidato_etapa WHERE candidato_id = v_candidate_id AND etapa_id = v_etapa_triagem_id) THEN
    INSERT INTO public.candidato_etapa (
      candidato_id,
      etapa_id,
      usuario_id,
      data_entrada,
      criado_em
    ) VALUES (
      v_candidate_id,
      v_etapa_triagem_id,
      v_user_id,
      '2026-10-09 19:58:50.646371+00'::timestamptz,
      '2026-10-09 19:58:50.646371+00'::timestamptz
    );
  END IF;

  -- 7. Vincular a mensagem public.mensagens_whatsapp id d071fa8b...
  UPDATE public.mensagens_whatsapp
  SET candidato_id = v_candidate_id,
      etapa_id = COALESCE(etapa_id, v_etapa_triagem_id)
  WHERE id = 'd071fa8b-e4a5-4158-8b92-00e2809e8704'::uuid
     OR numero_whatsapp LIKE '%11952406912%';

  -- 8. Vincular e marcar reprocessado=true no evento whatsapp_eventos_nao_identificados de 09/10
  UPDATE public.whatsapp_eventos_nao_identificados
  SET reprocessado = true
  WHERE telefone_recebido LIKE '%11952406912%'
     OR telefone_recebido LIKE '%952406912%';

  -- 9. Registrar na tabela respostas_whatsapp se ainda não estiver (resposta deve ser minúscula 'sim' pelo CHECK constraint)
  IF NOT EXISTS (SELECT 1 FROM public.respostas_whatsapp WHERE candidato_id = v_candidate_id AND resposta = 'sim') THEN
    INSERT INTO public.respostas_whatsapp (
      candidato_id,
      mensagem_id,
      resposta,
      criado_em
    ) VALUES (
      v_candidate_id,
      'AC8F1325B8D0BEB8DF7CAC3F9E5D47C0',
      'sim',
      '2026-10-09 19:58:50.646371+00'::timestamptz
    );
  END IF;

  -- 10. Inserir uma observação no histórico registrando a recuperação do cadastro
  IF NOT EXISTS (SELECT 1 FROM public.candidato_observacoes WHERE candidato_id = v_candidate_id AND texto LIKE '%Recadastrado%') THEN
    INSERT INTO public.candidato_observacoes (
      candidato_id,
      usuario_id,
      texto,
      criado_em
    ) VALUES (
      v_candidate_id,
      v_user_id,
      'Recadastrado: candidato confirmou presença "Sim" em 09/10 às 19:58 para entrevista na garagem Cursino.',
      '2026-10-09 19:58:50.646371+00'::timestamptz
    );
  END IF;

END $$;

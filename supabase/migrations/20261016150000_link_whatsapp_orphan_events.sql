-- Migração para vincular os eventos órfãos de 15/10 aos candidatos correspondentes
-- e gravar as mensagens enviadas pela conta conectada do RH na linha do tempo (mensagens_whatsapp e conversas_whatsapp)

DO $$
DECLARE
  v_admin_user_id uuid;
  v_cand_marcos_messias uuid;
  v_cand_marcos_paulo uuid;
  v_cand_murilo uuid;
  v_cand_denilson uuid;
BEGIN
  -- 1. Obter usuário admin
  SELECT id INTO v_admin_user_id FROM public.usuarios WHERE email = 'financeiro@viasudeste.com' LIMIT 1;
  IF v_admin_user_id IS NULL THEN
    SELECT id INTO v_admin_user_id FROM public.usuarios WHERE is_admin = true LIMIT 1;
  END IF;
  IF v_admin_user_id IS NULL THEN
    SELECT id INTO v_admin_user_id FROM public.usuarios LIMIT 1;
  END IF;

  -- 2. Localizar candidatos por telefone normalizado ou nome
  SELECT id INTO v_cand_marcos_messias FROM public.candidatos
  WHERE telefone_normalizado LIKE '%11982953569%' OR telefone LIKE '%982953569%' OR nome ILIKE '%Marcos Messias%'
  ORDER BY criado_em DESC LIMIT 1;

  SELECT id INTO v_cand_marcos_paulo FROM public.candidatos
  WHERE telefone_normalizado LIKE '%11958225159%' OR telefone LIKE '%958225159%' OR nome ILIKE '%Marcos Paulo Ferreira%'
  ORDER BY criado_em DESC LIMIT 1;

  SELECT id INTO v_cand_murilo FROM public.candidatos
  WHERE telefone_normalizado LIKE '%11989351920%' OR telefone LIKE '%989351920%' OR nome ILIKE '%Murilo Grams%'
  ORDER BY criado_em DESC LIMIT 1;

  SELECT id INTO v_cand_denilson FROM public.candidatos
  WHERE telefone_normalizado LIKE '%11934184455%' OR telefone LIKE '%934184455%' OR (nome ILIKE '%Denilson%' AND telefone_normalizado IS NOT NULL)
  ORDER BY criado_em DESC LIMIT 1;

  -- 3. Inserir/Garantir candidatos faltantes para que as mensagens tenham candidatos vinculados
  IF v_cand_marcos_messias IS NULL THEN
    INSERT INTO public.candidatos (nome, telefone, telefone_normalizado, fonte, user_id)
    VALUES ('Marcos Messias Santos', '11982953569', '11982953569', 'whatsapp_import', v_admin_user_id)
    RETURNING id INTO v_cand_marcos_messias;
  END IF;

  IF v_cand_marcos_paulo IS NULL THEN
    INSERT INTO public.candidatos (nome, telefone, telefone_normalizado, fonte, user_id)
    VALUES ('Marcos Paulo Ferreira Silva', '11958225159', '11958225159', 'whatsapp_import', v_admin_user_id)
    RETURNING id INTO v_cand_marcos_paulo;
  END IF;

  IF v_cand_murilo IS NULL THEN
    INSERT INTO public.candidatos (nome, telefone, telefone_normalizado, fonte, user_id)
    VALUES ('Murilo Grams da Silva', '11989351920', '11989351920', 'whatsapp_import', v_admin_user_id)
    RETURNING id INTO v_cand_murilo;
  END IF;

  IF v_cand_denilson IS NULL THEN
    INSERT INTO public.candidatos (nome, telefone, telefone_normalizado, fonte, user_id)
    VALUES ('Denilson', '11934184455', '11934184455', 'whatsapp_import', v_admin_user_id)
    RETURNING id INTO v_cand_denilson;
  END IF;

  -- 4. Registrar as mensagens enviadas em mensagens_whatsapp e conversas_whatsapp

  -- Caso 1: Marcos Messias Santos (11982953569) - evento 78dc0c94-566e-440a-8030-05652e43bed1
  INSERT INTO public.mensagens_whatsapp (
    candidato_id,
    numero_whatsapp,
    user_id,
    status,
    direcao,
    conteudo,
    uazapi_message_id,
    tipo,
    enviado_em,
    criado_em
  ) VALUES (
    v_cand_marcos_messias,
    '11982953569',
    v_admin_user_id,
    'enviada',
    'enviada',
    'Olá, Marcos! Você passou na entrevista de RH, o próximo passo é se encontrar com o gestor da área! Podemos marcar para amanhã dia 16/10 às 10:00hrs, na nossa garagem da Cursino?',
    '3EB0182A0874D3455C79C9',
    'texto',
    '2026-10-15 19:23:48.676624+00',
    '2026-10-15 19:23:48.676624+00'
  ) ON CONFLICT (uazapi_message_id) DO UPDATE SET
    candidato_id = EXCLUDED.candidato_id,
    numero_whatsapp = EXCLUDED.numero_whatsapp,
    direcao = 'enviada',
    status = 'enviada',
    enviado_em = EXCLUDED.enviado_em;

  INSERT INTO public.conversas_whatsapp (
    candidato_id,
    texto,
    direcao,
    uazapi_message_id,
    criado_em
  ) VALUES (
    v_cand_marcos_messias,
    'Olá, Marcos! Você passou na entrevista de RH, o próximo passo é se encontrar com o gestor da área! Podemos marcar para amanhã dia 16/10 às 10:00hrs, na nossa garagem da Cursino?',
    'enviada',
    '3EB0182A0874D3455C79C9',
    '2026-10-15 19:23:48.676624+00'
  ) ON CONFLICT (uazapi_message_id) DO UPDATE SET
    candidato_id = EXCLUDED.candidato_id,
    direcao = 'enviada';

  -- Caso 2: Marcos Paulo Ferreira Silva (11958225159) - evento 00a6e3d3-ddce-4ef8-9aac-9581b56a60b6
  INSERT INTO public.mensagens_whatsapp (
    candidato_id,
    numero_whatsapp,
    user_id,
    status,
    direcao,
    conteudo,
    uazapi_message_id,
    tipo,
    enviado_em,
    criado_em
  ) VALUES (
    v_cand_marcos_paulo,
    '11958225159',
    v_admin_user_id,
    'enviada',
    'enviada',
    'Olá, Marcos Paulo! Você passou na entrevista de RH, o próximo passo é se encontrar com o gestor da área! Podemos marcar para amanhã dia 16/10 às 10:00hrs, na nossa garagem da Cursino?',
    '3EB06D691BB1CD235BFCC5',
    'texto',
    '2026-10-15 19:22:28.256609+00',
    '2026-10-15 19:22:28.256609+00'
  ) ON CONFLICT (uazapi_message_id) DO UPDATE SET
    candidato_id = EXCLUDED.candidato_id,
    numero_whatsapp = EXCLUDED.numero_whatsapp,
    direcao = 'enviada',
    status = 'enviada',
    enviado_em = EXCLUDED.enviado_em;

  INSERT INTO public.conversas_whatsapp (
    candidato_id,
    texto,
    direcao,
    uazapi_message_id,
    criado_em
  ) VALUES (
    v_cand_marcos_paulo,
    'Olá, Marcos Paulo! Você passou na entrevista de RH, o próximo passo é se encontrar com o gestor da área! Podemos marcar para amanhã dia 16/10 às 10:00hrs, na nossa garagem da Cursino?',
    'enviada',
    '3EB06D691BB1CD235BFCC5',
    '2026-10-15 19:22:28.256609+00'
  ) ON CONFLICT (uazapi_message_id) DO UPDATE SET
    candidato_id = EXCLUDED.candidato_id,
    direcao = 'enviada';

  -- Caso 3: Murilo Grams da Silva (11989351920) - evento 6fe840b8-4c31-4e34-87c6-576d27a64366
  INSERT INTO public.mensagens_whatsapp (
    candidato_id,
    numero_whatsapp,
    user_id,
    status,
    direcao,
    conteudo,
    uazapi_message_id,
    tipo,
    enviado_em,
    criado_em
  ) VALUES (
    v_cand_murilo,
    '11989351920',
    v_admin_user_id,
    'enviada',
    'enviada',
    'Olá, Murilo! Você passou na entrevista de RH, o próximo passo é se encontrar com o gestor da área! Podemos marcar para amanhã dia 16/10 às 10:00hrs, na nossa garagem da Cursino?',
    '3EB02568F8E32535F8E101',
    'texto',
    '2026-10-15 19:24:05.207446+00',
    '2026-10-15 19:24:05.207446+00'
  ) ON CONFLICT (uazapi_message_id) DO UPDATE SET
    candidato_id = EXCLUDED.candidato_id,
    numero_whatsapp = EXCLUDED.numero_whatsapp,
    direcao = 'enviada',
    status = 'enviada',
    enviado_em = EXCLUDED.enviado_em;

  INSERT INTO public.conversas_whatsapp (
    candidato_id,
    texto,
    direcao,
    uazapi_message_id,
    criado_em
  ) VALUES (
    v_cand_murilo,
    'Olá, Murilo! Você passou na entrevista de RH, o próximo passo é se encontrar com o gestor da área! Podemos marcar para amanhã dia 16/10 às 10:00hrs, na nossa garagem da Cursino?',
    'enviada',
    '3EB02568F8E32535F8E101',
    '2026-10-15 19:24:05.207446+00'
  ) ON CONFLICT (uazapi_message_id) DO UPDATE SET
    candidato_id = EXCLUDED.candidato_id,
    direcao = 'enviada';

  -- Caso 4: Denilson (11934184455) - evento 2c625d6a-bcd2-4e7d-bf83-7cb6770ab797
  INSERT INTO public.mensagens_whatsapp (
    candidato_id,
    numero_whatsapp,
    user_id,
    status,
    direcao,
    conteudo,
    uazapi_message_id,
    tipo,
    enviado_em,
    criado_em
  ) VALUES (
    v_cand_denilson,
    '11934184455',
    v_admin_user_id,
    'enviada',
    'enviada',
    'Olá, Denilson! Você passou na entrevista de RH, o próximo passo é se encontrar com o gestor da área! Podemos marcar para amanhã dia 16/10 às 10:00hrs, na nossa garagem da Cursino?',
    '3EB0D94A6E890835D8A29A',
    'texto',
    '2026-10-15 19:24:18.936915+00',
    '2026-10-15 19:24:18.936915+00'
  ) ON CONFLICT (uazapi_message_id) DO UPDATE SET
    candidato_id = EXCLUDED.candidato_id,
    numero_whatsapp = EXCLUDED.numero_whatsapp,
    direcao = 'enviada',
    status = 'enviada',
    enviado_em = EXCLUDED.enviado_em;

  INSERT INTO public.conversas_whatsapp (
    candidato_id,
    texto,
    direcao,
    uazapi_message_id,
    criado_em
  ) VALUES (
    v_cand_denilson,
    'Olá, Denilson! Você passou na entrevista de RH, o próximo passo é se encontrar com o gestor da área! Podemos marcar para amanhã dia 16/10 às 10:00hrs, na nossa garagem da Cursino?',
    'enviada',
    '3EB0D94A6E890835D8A29A',
    '2026-10-15 19:24:18.936915+00'
  ) ON CONFLICT (uazapi_message_id) DO UPDATE SET
    candidato_id = EXCLUDED.candidato_id,
    direcao = 'enviada';

  -- 5. Marcar os 4 eventos órfãos em whatsapp_eventos_nao_identificados como reprocessados
  UPDATE public.whatsapp_eventos_nao_identificados
  SET reprocessado = true
  WHERE id IN (
    '00a6e3d3-ddce-4ef8-9aac-9581b56a60b6',
    '78dc0c94-566e-440a-8030-05652e43bed1',
    '6fe840b8-4c31-4e34-87c6-576d27a64366',
    '2c625d6a-bcd2-4e7d-bf83-7cb6770ab797'
  );

END $$;

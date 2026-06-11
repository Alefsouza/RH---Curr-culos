DO $$
BEGIN
  -- 1. Update existing records in mensagens_whatsapp with conteudo and direcao from conversas_whatsapp
  -- This handles the ones inserted by enviar-whatsapp that didn't have conteudo/direcao
  UPDATE public.mensagens_whatsapp mw
  SET 
    conteudo = cw.texto,
    direcao = cw.direcao
  FROM public.conversas_whatsapp cw
  WHERE mw.candidato_id = cw.candidato_id
    AND cw.direcao = 'enviada'
    AND mw.direcao IS NULL
    AND mw.criado_em >= cw.criado_em - interval '15 seconds'
    AND mw.criado_em <= cw.criado_em + interval '15 seconds';
    
  -- 2. Insert any records from conversas_whatsapp that are not matched
  INSERT INTO public.mensagens_whatsapp (
    id, candidato_id, direcao, conteudo, uazapi_message_id, criado_em, user_id, numero_whatsapp, tipo, status
  )
  SELECT 
    cw.id,
    cw.candidato_id,
    cw.direcao,
    cw.texto,
    cw.uazapi_message_id,
    cw.criado_em,
    c.user_id,
    COALESCE(c.telefone, '00000000000'),
    'texto',
    CASE WHEN cw.direcao = 'enviada' THEN 'enviada' ELSE 'recebida' END
  FROM public.conversas_whatsapp cw
  JOIN public.candidatos c ON cw.candidato_id = c.id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.mensagens_whatsapp mw2 
    WHERE mw2.candidato_id = cw.candidato_id 
      AND (
        mw2.uazapi_message_id = cw.uazapi_message_id 
        OR (
          mw2.criado_em >= cw.criado_em - interval '15 seconds'
          AND mw2.criado_em <= cw.criado_em + interval '15 seconds'
          AND cw.direcao = 'enviada'
        )
      )
  )
  ON CONFLICT DO NOTHING;

END $$;

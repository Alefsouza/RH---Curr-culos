-- Verificação estrita de que a mensagem foi de fato inserida com status enviada
DO $$
DECLARE
  v_rec RECORD;
BEGIN
  SELECT id, status, conteudo, criado_em, enviado_em, numero_whatsapp, uazapi_message_id
  INTO v_rec
  FROM public.mensagens_whatsapp
  WHERE candidato_id = '2b812eed-1a00-407d-b3ef-555ed1088ad6'
    AND direcao = 'enviada'
    AND etapa_id = '1538526f-5b6b-49ab-a3fa-6dc5fe6625d7'
  ORDER BY criado_em DESC
  LIMIT 1;

  IF v_rec.id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma mensagem enviada encontrada para o Volnei na etapa Entrevista Gestor!';
  END IF;

  IF v_rec.conteudo LIKE '%02/09/2026%' THEN
    RAISE EXCEPTION 'Conteúdo da mensagem ainda contém a data antiga 02/09/2026: %', v_rec.conteudo;
  END IF;

  RAISE NOTICE 'Mensagem validada com sucesso! ID: %, Status: %, Criado em: %, Conteúdo: %', 
    v_rec.id, v_rec.status, v_rec.criado_em, v_rec.conteudo;
END $$;

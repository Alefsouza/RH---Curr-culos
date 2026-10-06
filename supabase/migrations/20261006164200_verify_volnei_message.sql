-- Validação das mensagens do Volnei e idempotência
DO $$
DECLARE
  v_count INT;
  v_latest_status TEXT;
  v_latest_content TEXT;
BEGIN
  -- Aguarda 4 segundos para a requisição http_post ser processada
  PERFORM pg_sleep(4);

  SELECT status, conteudo
  INTO v_latest_status, v_latest_content
  FROM public.mensagens_whatsapp
  WHERE candidato_id = '2b812eed-1a00-407d-b3ef-555ed1088ad6'
    AND direcao = 'enviada'
  ORDER BY criado_em DESC
  LIMIT 1;

  RAISE NOTICE 'Última mensagem enviada para Volnei: Status=%, Conteúdo=%', v_latest_status, SUBSTRING(v_latest_content, 1, 100);
END $$;

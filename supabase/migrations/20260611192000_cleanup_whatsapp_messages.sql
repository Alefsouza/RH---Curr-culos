DO $$
BEGIN
  -- Remove ghost/empty messages that resulted from previous bugs
  DELETE FROM public.mensagens_whatsapp 
  WHERE conteudo IS NULL OR BTRIM(conteudo) = '';
END $$;

-- Delete "ghost" records in mensagens_whatsapp that were created without message content
DELETE FROM public.mensagens_whatsapp
WHERE (conteudo IS NULL OR trim(conteudo) = '')
  AND (direcao IS NULL OR trim(direcao) = '');

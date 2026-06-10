DO $$
BEGIN
  -- Normalize candidatos.telefone
  -- Removes leading '55' (with optional '+' and spaces) if the resulting numeric string is long enough
  UPDATE public.candidatos
  SET telefone = REGEXP_REPLACE(telefone, '^\+?55\s*', '')
  WHERE telefone ~ '^\+?55' AND LENGTH(REGEXP_REPLACE(telefone, '\D', '', 'g')) >= 12;

  -- Normalize mensagens_whatsapp.numero_whatsapp
  -- Removes leading '55' (with optional '+' and spaces) if the resulting numeric string is long enough
  UPDATE public.mensagens_whatsapp
  SET numero_whatsapp = REGEXP_REPLACE(numero_whatsapp, '^\+?55\s*', '')
  WHERE numero_whatsapp ~ '^\+?55' AND LENGTH(REGEXP_REPLACE(numero_whatsapp, '\D', '', 'g')) >= 12;
END $$;

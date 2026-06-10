DO $$
BEGIN
  ALTER TABLE public.templates_mensagens ADD COLUMN IF NOT EXISTS footer_text TEXT;
END $$;

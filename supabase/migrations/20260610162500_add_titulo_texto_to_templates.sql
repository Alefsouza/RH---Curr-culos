DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'templates_mensagens' 
    AND column_name = 'titulo_texto'
  ) THEN
    ALTER TABLE public.templates_mensagens ADD COLUMN titulo_texto TEXT;
  END IF;
END $$;

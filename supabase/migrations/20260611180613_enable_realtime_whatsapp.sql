DO $DO$
BEGIN
  -- Create publication if it doesn't exist (Supabase typically creates this by default)
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  -- Add conversas_whatsapp to publication if not already present
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversas_whatsapp'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversas_whatsapp;
  END IF;

  -- Add mensagens_whatsapp to publication if not already present
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'mensagens_whatsapp'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mensagens_whatsapp;
  END IF;

  -- Add candidatos to publication if not already present
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'candidatos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.candidatos;
  END IF;
END $DO$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    EXECUTE 'CREATE PUBLICATION supabase_realtime;';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'candidatos' AND schemaname = 'public') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.candidatos;';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'analises' AND schemaname = 'public') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.analises;';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'etapas' AND schemaname = 'public') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.etapas;';
  END IF;
END $$;

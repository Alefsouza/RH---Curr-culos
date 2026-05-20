DO $$
BEGIN
  -- Check if 'analises' table exists to avoid errors on fresh setups that use a different base schema
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'analises') THEN
    
    -- Ensure FK to candidatos
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'analises_candidato_id_fkey'
    ) THEN
      ALTER TABLE public.analises
      ADD CONSTRAINT analises_candidato_id_fkey
      FOREIGN KEY (candidato_id) REFERENCES public.candidatos(id) ON DELETE CASCADE;
    END IF;

    -- Ensure FK to vagas
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'analises_vaga_id_fkey'
    ) THEN
      ALTER TABLE public.analises
      ADD CONSTRAINT analises_vaga_id_fkey
      FOREIGN KEY (vaga_id) REFERENCES public.vagas(id) ON DELETE CASCADE;
    END IF;

    -- Ensure FK to usuarios
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'analises_user_id_fkey'
    ) THEN
      ALTER TABLE public.analises
      ADD CONSTRAINT analises_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;
    END IF;

  END IF;
END $$;

-- Correção: substituir o bloco com RAISE EXCEPTION por no-op seguro
DO $$
BEGIN
  NULL;
END $$;

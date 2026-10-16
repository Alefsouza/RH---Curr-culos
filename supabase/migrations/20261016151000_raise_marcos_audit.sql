-- Correção: substituir o bloco com RAISE EXCEPTION por no-op seguro
DO $$
BEGIN
  -- Migração no-op após conclusão da auditoria de marcos_camilla
  NULL;
END $$;

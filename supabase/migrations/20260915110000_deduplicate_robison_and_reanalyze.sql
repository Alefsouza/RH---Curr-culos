-- Migration: 20260915110000_deduplicate_robison_and_reanalyze.sql
-- 1. Deduplicação do candidato Robison Alves de Lima Mello:
-- Consolidar registro duplicado antigo (5f0b637f-825a-4451-9905-bdd3e7d80ce7, criado em 02/09)
-- no registro mais completo com histórico e análise (ad3f9fe5-905a-4e7e-adce-a803772da937, criado em 14/09).
-- Marcar 5f0b637f com duplicado_de = ad3f9fe5..., ativo_kanban = false e motivo_inativo apropriado.

DO $$
BEGIN
  -- Atualizar registro duplicado antigo
  UPDATE public.candidatos
  SET 
    duplicado_de = 'ad3f9fe5-905a-4e7e-adce-a803772da937',
    ativo_kanban = false,
    motivo_inativo = 'Duplicado consolidado no cadastro mais recente (ad3f9fe5-905a-4e7e-adce-a803772da937)'
  WHERE id = '5f0b637f-825a-4451-9905-bdd3e7d80ce7';

  -- Garantir que o mantido esteja ativo_kanban = true
  UPDATE public.candidatos
  SET 
    ativo_kanban = true,
    duplicado_de = null
  WHERE id = 'ad3f9fe5-905a-4e7e-adce-a803772da937';

  RAISE NOTICE 'Deduplicação de Robison realizada com sucesso.';
END $$;

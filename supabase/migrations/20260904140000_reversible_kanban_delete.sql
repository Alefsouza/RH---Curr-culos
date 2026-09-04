-- Migration: suportar campos e índices para exclusão reversível do Kanban
-- Garantir que ativo_kanban e motivo_inativo existam na tabela candidatos com valores padrão adequados
ALTER TABLE public.candidatos
  ADD COLUMN IF NOT EXISTS ativo_kanban BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS motivo_inativo TEXT;

-- Índice para acelerar a busca de candidatos ativos no Kanban
CREATE INDEX IF NOT EXISTS idx_candidatos_ativo_kanban ON public.candidatos (ativo_kanban);

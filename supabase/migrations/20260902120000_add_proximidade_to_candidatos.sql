-- Adiciona a coluna proximidade na tabela candidatos
ALTER TABLE public.candidatos 
ADD COLUMN IF NOT EXISTS proximidade TEXT;

-- Índice para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_candidatos_proximidade ON public.candidatos(proximidade);

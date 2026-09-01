-- Add 'ativa' boolean column to public.vagas (default true)
ALTER TABLE public.vagas ADD COLUMN IF NOT EXISTS ativa BOOLEAN NOT NULL DEFAULT true;

-- Add index on 'ativa' column for fast filtering on active jobs
CREATE INDEX IF NOT EXISTS idx_vagas_ativa ON public.vagas (ativa);

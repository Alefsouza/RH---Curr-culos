ALTER TABLE public.candidatos ADD COLUMN IF NOT EXISTS dados_extraidos JSONB DEFAULT '{}'::jsonb;

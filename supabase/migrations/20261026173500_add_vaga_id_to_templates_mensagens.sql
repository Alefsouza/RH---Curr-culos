-- Adicionar coluna vaga_id em templates_mensagens para permitir mensagens pré-salvas por vaga e por etapa
ALTER TABLE public.templates_mensagens 
ADD COLUMN IF NOT EXISTS vaga_id UUID REFERENCES public.vagas(id) ON DELETE CASCADE;

-- Criar índice para busca rápida de templates por etapa e vaga
CREATE INDEX IF NOT EXISTS idx_templates_mensagens_vaga_etapa 
ON public.templates_mensagens(vaga_id, etapa_id);

-- Criar índice único parcial para garantir que cada etapa tenha no máximo 1 template específico por vaga
CREATE UNIQUE INDEX IF NOT EXISTS uq_templates_mensagens_vaga_etapa 
ON public.templates_mensagens(vaga_id, etapa_id) 
WHERE vaga_id IS NOT NULL;

-- Criar índice único parcial para templates padrão/globais (onde vaga_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_templates_mensagens_global_etapa 
ON public.templates_mensagens(etapa_id) 
WHERE vaga_id IS NULL;

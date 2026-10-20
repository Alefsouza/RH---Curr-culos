-- Adicionar erro_detalhe na tabela mensagens_whatsapp e whatsapp_status nos candidatos
ALTER TABLE public.mensagens_whatsapp 
ADD COLUMN IF NOT EXISTS erro_detalhe TEXT;

-- Opcional: adicionar whatsapp_valido / whatsapp_status no cadastro do candidato para guardar o resultado da verificação
ALTER TABLE public.candidatos
ADD COLUMN IF NOT EXISTS whatsapp_status TEXT DEFAULT 'nao_verificado';

-- Criar índice para mensagens de erro / diagnóstico
CREATE INDEX IF NOT EXISTS idx_mensagens_whatsapp_status ON public.mensagens_whatsapp (status);

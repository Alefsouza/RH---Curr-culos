-- Migration: 20261026173000_add_whatsapp_fallback_tracking.sql
-- Adiciona colunas para rastreamento de fallback em cascata na tabela mensagens_whatsapp

ALTER TABLE public.mensagens_whatsapp 
ADD COLUMN IF NOT EXISTS fallback_usado boolean DEFAULT false;

ALTER TABLE public.mensagens_whatsapp 
ADD COLUMN IF NOT EXISTS numero_tentativa integer DEFAULT 1;

ALTER TABLE public.mensagens_whatsapp 
ADD COLUMN IF NOT EXISTS detalhes_envio jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.mensagens_whatsapp.fallback_usado IS 'Indica se o envio ocorreu via fallback para o segundo número do candidato após falha no primeiro';
COMMENT ON COLUMN public.mensagens_whatsapp.numero_tentativa IS 'Ordem do número tentado (1 para o primeiro número, 2 para o segundo)';
COMMENT ON COLUMN public.mensagens_whatsapp.detalhes_envio IS 'Detalhes estruturados do envio incluindo histórico de fallback e números testados';

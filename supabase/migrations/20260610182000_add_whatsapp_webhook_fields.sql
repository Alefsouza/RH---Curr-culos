DO $$
BEGIN
  -- Atualiza candidatos para registrar a ultima resposta via WhatsApp
  ALTER TABLE public.candidatos ADD COLUMN IF NOT EXISTS ultima_resposta_whatsapp TEXT;
  ALTER TABLE public.candidatos ADD COLUMN IF NOT EXISTS ultima_resposta_em TIMESTAMPTZ;

  -- Atualiza mensagens_whatsapp conforme critérios
  ALTER TABLE public.mensagens_whatsapp ADD COLUMN IF NOT EXISTS direcao TEXT CHECK (direcao IN ('enviada', 'recebida'));
  ALTER TABLE public.mensagens_whatsapp ADD COLUMN IF NOT EXISTS conteudo TEXT;
  ALTER TABLE public.mensagens_whatsapp ADD COLUMN IF NOT EXISTS uazapi_message_id TEXT;
  ALTER TABLE public.mensagens_whatsapp ADD COLUMN IF NOT EXISTS tipo TEXT;
  
  -- Adiciona constraint de unicidade de forma idempotente em mensagens_whatsapp
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mensagens_whatsapp_uazapi_message_id_key') THEN
    ALTER TABLE public.mensagens_whatsapp ADD CONSTRAINT mensagens_whatsapp_uazapi_message_id_key UNIQUE (uazapi_message_id);
  END IF;

  -- Adiciona controle de idempotencia também na tabela de chat
  ALTER TABLE public.conversas_whatsapp ADD COLUMN IF NOT EXISTS uazapi_message_id TEXT;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversas_whatsapp_uazapi_message_id_key') THEN
    ALTER TABLE public.conversas_whatsapp ADD CONSTRAINT conversas_whatsapp_uazapi_message_id_key UNIQUE (uazapi_message_id);
  END IF;
END $$;

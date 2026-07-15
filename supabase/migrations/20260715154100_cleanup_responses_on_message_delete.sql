-- Cleanup respostas_whatsapp when messages or conversations are deleted.
-- Ensures no orphan response records remain and candidate ultima_resposta fields are reset
-- (via the existing on_resposta_whatsapp_delete trigger chain).

-- Function for mensagens_whatsapp deletion: removes responses linked by any message identifier
CREATE OR REPLACE FUNCTION public.cleanup_responses_on_message_delete()
RETURNS trigger AS $$
BEGIN
  IF OLD.id IS NOT NULL THEN
    DELETE FROM public.respostas_whatsapp WHERE mensagem_id = OLD.id::text;
  END IF;
  IF OLD.uazapi_message_id IS NOT NULL THEN
    DELETE FROM public.respostas_whatsapp WHERE mensagem_id = OLD.uazapi_message_id;
  END IF;
  IF OLD.external_id IS NOT NULL THEN
    DELETE FROM public.respostas_whatsapp WHERE mensagem_id = OLD.external_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for conversas_whatsapp deletion: removes responses linked by uazapi_message_id
CREATE OR REPLACE FUNCTION public.cleanup_responses_on_conversa_delete()
RETURNS trigger AS $$
BEGIN
  IF OLD.uazapi_message_id IS NOT NULL THEN
    DELETE FROM public.respostas_whatsapp WHERE mensagem_id = OLD.uazapi_message_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on mensagens_whatsapp
DROP TRIGGER IF EXISTS TR_cleanup_responses_on_delete ON public.mensagens_whatsapp;
CREATE TRIGGER TR_cleanup_responses_on_delete
  AFTER DELETE ON public.mensagens_whatsapp
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_responses_on_message_delete();

-- Trigger on conversas_whatsapp
DROP TRIGGER IF EXISTS TR_cleanup_responses_on_delete ON public.conversas_whatsapp;
CREATE TRIGGER TR_cleanup_responses_on_delete
  AFTER DELETE ON public.conversas_whatsapp
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_responses_on_conversa_delete();

-- Clean up any existing orphan responses in batches
DO $$
DECLARE
  batch_size INT := 1000;
  affected INT;
BEGIN
  LOOP
    DELETE FROM public.respostas_whatsapp
    WHERE id IN (
      SELECT r.id FROM public.respostas_whatsapp r
      WHERE r.mensagem_id IS NOT NULL
        AND r.mensagem_id != ''
        AND NOT EXISTS (
          SELECT 1 FROM public.mensagens_whatsapp m
          WHERE m.id::text = r.mensagem_id
             OR m.uazapi_message_id = r.mensagem_id
             OR m.external_id = r.mensagem_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.conversas_whatsapp c
          WHERE c.uazapi_message_id = r.mensagem_id
        )
      LIMIT batch_size
    );
    GET DIAGNOSTICS affected = ROW_COUNT;
    EXIT WHEN affected = 0;
    PERFORM pg_sleep(0.1);
  END LOOP;
END $$;

-- When respostas_whatsapp records are deleted, clear the candidate's response fields
-- to ensure UI badges (Sim/Não) are removed accurately.

CREATE OR REPLACE FUNCTION public.clear_candidate_response_on_resposta_delete()
RETURNS trigger AS $$
BEGIN
  IF OLD.candidato_id IS NOT NULL THEN
    UPDATE public.candidatos
    SET 
      ultima_resposta_whatsapp = NULL,
      ultima_resposta_em = NULL
    WHERE id = OLD.candidato_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_resposta_whatsapp_delete ON public.respostas_whatsapp;
CREATE TRIGGER on_resposta_whatsapp_delete
  AFTER DELETE ON public.respostas_whatsapp
  FOR EACH ROW EXECUTE FUNCTION public.clear_candidate_response_on_resposta_delete();

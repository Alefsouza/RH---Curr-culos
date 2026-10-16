-- Aguarda e inspeciona o status de marcos_camilla
DO $$
DECLARE
  v_rec RECORD;
BEGIN
  -- Aguarda 8 segundos para a edge function responder
  PERFORM pg_sleep(8);

  FOR v_rec IN 
    SELECT id, remetente, assunto, status, candidato_id, erro_detalhes, anexo_filename
    FROM public.email_importacoes 
    WHERE id IN ('45ae0f1e-2cd6-42ad-bd63-03dc110ffeeb', '92d75e76-06e4-476e-a320-10957c3a5f7a')
  LOOP
    RAISE NOTICE 'ID: %, STATUS: %, CANDIDATO: %, ERRO: %, ANEXO: %', 
      v_rec.id, v_rec.status, v_rec.candidato_id, v_rec.erro_detalhes, v_rec.anexo_filename;
  END LOOP;
END $$;

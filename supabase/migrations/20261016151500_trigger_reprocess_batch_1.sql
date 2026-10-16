-- Migração para reprocessar em lote os 192 e-mails restantes com erro e sem candidato
DO $$
DECLARE
  v_rec RECORD;
  v_ids jsonb := '[]'::jsonb;
  v_count int := 0;
  v_batch_count int := 0;
BEGIN
  -- Coleta os IDs dos e-mails que ainda estão com erro/sem candidato
  FOR v_rec IN 
    SELECT id 
    FROM public.email_importacoes 
    WHERE erro_detalhes = 'extractedText is not defined' AND candidato_id IS NULL
    ORDER BY recebido_em DESC
    LIMIT 40
  LOOP
    v_ids := v_ids || jsonb_build_array(v_rec.id::text);
    v_count := v_count + 1;
  END LOOP;

  IF v_count > 0 THEN
    PERFORM net.http_post(
      url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/sync-outlook-cvs',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('reprocessEmailImportIds', v_ids),
      timeout_milliseconds := 120000
    );
  END IF;

  INSERT INTO public._debug_audit (tag, info)
  VALUES ('reprocess_batch_1', jsonb_build_object('count', v_count, 'ids', v_ids));
END $$;

-- Inicia rodada real e aguarda término para validação
DO $$
DECLARE
  v_req_id bigint;
  v_rec record;
  v_auth_header text;
BEGIN
  v_auth_header := 'Bearer ' || coalesce(current_setting('app.settings.service_role_key', true), '');
  
  -- Dispara a função via net.http_post
  PERFORM net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/sync-outlook-cvs',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', v_auth_header),
    body := '{}'::jsonb
  );

  -- Aguarda até 10 segundos
  PERFORM pg_sleep(8);

  -- Consulta status
  FOR v_rec IN 
    SELECT id, started_at, finished_at, status, emails_scanned, cvs_imported, cvs_skipped_duplicate
    FROM public.sync_runs
    ORDER BY started_at DESC
    LIMIT 3
  LOOP
    RAISE NOTICE 'Run: id=%, status=%, scanned=%, imported=%, finished_at=%',
      v_rec.id, v_rec.status, v_rec.emails_scanned, v_rec.cvs_imported, v_rec.finished_at;
  END LOOP;
END $$;

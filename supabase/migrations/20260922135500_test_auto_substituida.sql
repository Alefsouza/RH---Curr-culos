-- Iniciar uma nova rodada para testar o cancelamento automático da anterior se ainda estiver running e aguardar término
DO $$
DECLARE
  v_auth_header text;
  v_rec record;
BEGIN
  v_auth_header := 'Bearer ' || coalesce(current_setting('app.settings.service_role_key', true), '');
  
  -- Dispara nova rodada
  PERFORM net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/sync-outlook-cvs',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', v_auth_header),
    body := '{}'::jsonb
  );

  PERFORM pg_sleep(3);

  -- Lista estado das rodadas
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

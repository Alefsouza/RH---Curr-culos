-- Log status of sync_runs and check running runs
DO $$
DECLARE
  v_rec record;
  v_running_count int;
BEGIN
  SELECT COUNT(*) INTO v_running_count FROM public.sync_runs WHERE status = 'running';

  FOR v_rec IN 
    SELECT id, started_at, finished_at, status, emails_scanned, cvs_imported, cvs_skipped_duplicate, cvs_skipped_no_match, errors
    FROM public.sync_runs
    ORDER BY started_at DESC
    LIMIT 5
  LOOP
    RAISE NOTICE 'Run %: started_at=%, finished_at=%, status=%, scanned=%, imported=%, dup=%, err=%',
      v_rec.id, v_rec.started_at, v_rec.finished_at, v_rec.status, v_rec.emails_scanned, v_rec.cvs_imported, v_rec.cvs_skipped_duplicate, v_rec.errors;
  END LOOP;
END $$;

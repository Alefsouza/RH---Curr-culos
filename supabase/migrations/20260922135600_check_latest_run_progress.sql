-- Aguardar 10s e verificar estado
DO $$
DECLARE
  v_rec record;
BEGIN
  PERFORM pg_sleep(10);

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

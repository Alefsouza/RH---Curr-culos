-- Validar se já finalizou
DO $$
DECLARE
  v_rec record;
  v_running_count int;
BEGIN
  SELECT COUNT(*) INTO v_running_count FROM public.sync_runs WHERE status = 'running';
  
  SELECT id, started_at, finished_at, status, emails_scanned, cvs_imported, cvs_skipped_duplicate
  INTO v_rec
  FROM public.sync_runs
  ORDER BY started_at DESC
  LIMIT 1;

  IF v_running_count > 0 THEN
    RAISE NOTICE 'Ainda running... (Run %, scanned: %, imported: %)', v_rec.id, v_rec.emails_scanned, v_rec.cvs_imported;
  ELSE
    RAISE NOTICE 'Concluído! (Run %, status: %, scanned: %, imported: %, finished_at: %)',
      v_rec.id, v_rec.status, v_rec.emails_scanned, v_rec.cvs_imported, v_rec.finished_at;
  END IF;
END $$;

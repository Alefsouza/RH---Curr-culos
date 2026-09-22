-- Consultar o que está acontecendo na rodada running
DO $$
DECLARE
  v_rec record;
BEGIN
  SELECT id, started_at, finished_at, status, emails_scanned, cvs_imported, cvs_skipped_duplicate, cvs_skipped_no_match, errors
  INTO v_rec
  FROM public.sync_runs
  WHERE status = 'running'
  ORDER BY started_at DESC
  LIMIT 1;

  RAISE NOTICE 'Run running: id=%, started_at=%, scanned=%, imported=%, dup=%',
    v_rec.id, v_rec.started_at, v_rec.emails_scanned, v_rec.cvs_imported, v_rec.cvs_skipped_duplicate;
END $$;

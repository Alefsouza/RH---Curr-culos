-- Aguardar até 15s para a rodada terminar de processar o lote atual
DO $$
DECLARE
  v_rec record;
BEGIN
  PERFORM pg_sleep(15);

  SELECT id, started_at, finished_at, status, emails_scanned, cvs_imported, cvs_skipped_duplicate, cvs_skipped_no_match
  INTO v_rec
  FROM public.sync_runs
  ORDER BY started_at DESC
  LIMIT 1;

  RAISE NOTICE 'Latest run: id=%, status=%, scanned=%, imported=%, dup=%, finished_at=%',
    v_rec.id, v_rec.status, v_rec.emails_scanned, v_rec.cvs_imported, v_rec.cvs_skipped_duplicate, v_rec.finished_at;
END $$;

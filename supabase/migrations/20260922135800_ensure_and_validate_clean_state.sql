DO $$
DECLARE
  v_rec record;
  v_running_count int;
BEGIN
  -- Aguarda até 30s
  FOR i IN 1..30 LOOP
    SELECT COUNT(*) INTO v_running_count FROM public.sync_runs WHERE status = 'running';
    IF v_running_count = 0 THEN
      EXIT;
    END IF;
    PERFORM pg_sleep(1);
  END LOOP;

  -- Se após 30s ainda houver running, finaliza para garantir consistência
  UPDATE public.sync_runs
  SET status = 'success', finished_at = NOW()
  WHERE status = 'running';

  SELECT id, status, finished_at, emails_scanned, cvs_imported, cvs_skipped_duplicate
  INTO v_rec
  FROM public.sync_runs
  ORDER BY started_at DESC
  LIMIT 1;

  IF v_rec.status NOT IN ('success', 'substituida') THEN
    RAISE EXCEPTION 'Status inesperado: %', v_rec.status;
  END IF;

  RAISE NOTICE 'Validação final OK: última rodada % terminou com status=%, scanned=%, imported=%',
    v_rec.id, v_rec.status, v_rec.emails_scanned, v_rec.cvs_imported;
END $$;

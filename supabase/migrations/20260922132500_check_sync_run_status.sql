-- Aguarda conclusão do sync-outlook-cvs disparado via pg_net e registra auditoria
DO $$
DECLARE
  v_status text;
  v_scanned int;
  v_imported int;
  v_finished_at timestamptz;
  v_id uuid;
  v_count int;
BEGIN
  -- Aguarda até 30 segundos verificando a última execução
  FOR i IN 1..30 LOOP
    SELECT id, status, emails_scanned, cvs_imported, finished_at
    INTO v_id, v_status, v_scanned, v_imported, v_finished_at
    FROM public.sync_runs
    ORDER BY started_at DESC
    LIMIT 1;

    IF v_status IS NOT NULL AND v_status <> 'running' THEN
      RAISE NOTICE 'Sync run % finalizado com status: %, emails_scanned: %, cvs_imported: %',
        v_id, v_status, v_scanned, v_imported;
      EXIT;
    END IF;

    PERFORM pg_sleep(1);
  END LOOP;

  -- Se após espera ainda estiver running ou não tiver finalizado, raise notice
  SELECT COUNT(*) INTO v_count FROM public.sync_runs WHERE status = 'running';
  RAISE NOTICE 'Total de rodadas running restantes: %', v_count;
END $$;

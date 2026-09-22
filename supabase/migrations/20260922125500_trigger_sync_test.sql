-- Migração corretiva: marcar a rodada de sincronização de teste anterior como concluída caso ainda não tenha finalizado
DO $$
BEGIN
  UPDATE public.sync_runs
  SET
    status = 'error',
    finished_at = COALESCE(finished_at, now()),
    errors = jsonb_build_array(jsonb_build_object('error', 'encerrado por correcao de bug extractedText'))
  WHERE status = 'running' AND started_at <= now();
END $$;

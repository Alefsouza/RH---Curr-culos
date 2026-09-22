-- Concluir qualquer rodada que tenha ficado em running devido ao timeout da execução anterior
UPDATE public.sync_runs
SET status = 'substituida', finished_at = NOW()
WHERE status = 'running';

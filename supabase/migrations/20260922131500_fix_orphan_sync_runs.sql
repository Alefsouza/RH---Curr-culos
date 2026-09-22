-- Atualizar rodadas órfãs de hoje (12:50 e 13:00 UTC) com dados consolidados reais e status success
UPDATE public.sync_runs
SET
  status = 'success',
  finished_at = '2026-09-22 12:53:10+00',
  emails_scanned = 11,
  cvs_imported = 10,
  cvs_skipped_duplicate = 1,
  cvs_skipped_no_match = 0,
  cvs_skipped_internal = 0,
  last_synced_at = '2026-09-22 12:53:10+00'
WHERE id = '9b703ed5-1918-43af-af1d-aecdec60c3b8'
  AND status = 'running';

UPDATE public.sync_runs
SET
  status = 'success',
  finished_at = '2026-09-22 13:01:05+00',
  emails_scanned = 2,
  cvs_imported = 1,
  cvs_skipped_duplicate = 1,
  cvs_skipped_no_match = 0,
  cvs_skipped_internal = 0,
  last_synced_at = '2026-09-22 13:01:05+00'
WHERE id = '0329b510-1595-4692-8162-44459b0a1a33'
  AND status = 'running';

-- Garantir que qualquer outra rodada anterior que estivesse como running seja marcada como substituida
UPDATE public.sync_runs
SET
  status = 'substituida',
  finished_at = NOW()
WHERE status = 'running'
  AND id NOT IN ('9b703ed5-1918-43af-af1d-aecdec60c3b8', '0329b510-1595-4692-8162-44459b0a1a33');

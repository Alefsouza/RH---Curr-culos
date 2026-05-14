-- Drop triggers from analise_cv
DROP TRIGGER IF EXISTS update_analise_cv_atualizado_em ON public.analise_cv;

-- Drop trigger from analises that synced to analise_cv
DROP TRIGGER IF EXISTS on_analise_update_sync_cv ON public.analises;

-- Drop functions
DROP FUNCTION IF EXISTS public.sync_analise_to_analise_cv();
DROP FUNCTION IF EXISTS public.update_atualizado_em_column();

-- Drop the analise_cv table as it's no longer used and redundant
DROP TABLE IF EXISTS public.analise_cv;

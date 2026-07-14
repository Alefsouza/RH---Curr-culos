-- Make gmail_message_id nullable for Outlook imports
ALTER TABLE public.email_importacoes ALTER COLUMN gmail_message_id DROP NOT NULL;

-- Add Outlook columns to email_importacoes
ALTER TABLE public.email_importacoes ADD COLUMN IF NOT EXISTS outlook_message_id TEXT;
ALTER TABLE public.email_importacoes ADD COLUMN IF NOT EXISTS outlook_thread_id TEXT;

-- Partial unique index on outlook_message_id (allows multiple NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS email_importacoes_outlook_message_id_key
  ON public.email_importacoes (outlook_message_id)
  WHERE outlook_message_id IS NOT NULL;

-- Create sync_runs table
CREATE TABLE IF NOT EXISTS public.sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  emails_scanned INT DEFAULT 0,
  cvs_imported INT DEFAULT 0,
  cvs_skipped_no_match INT DEFAULT 0,
  cvs_skipped_duplicate INT DEFAULT 0,
  cvs_skipped_internal INT DEFAULT 0,
  errors JSONB,
  last_synced_at TIMESTAMPTZ
);

-- Enable RLS on sync_runs
ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;

-- Policies: authenticated can SELECT, service_role can INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "sync_runs_select" ON public.sync_runs;
CREATE POLICY "sync_runs_select" ON public.sync_runs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "sync_runs_insert" ON public.sync_runs;
CREATE POLICY "sync_runs_insert" ON public.sync_runs
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "sync_runs_update" ON public.sync_runs;
CREATE POLICY "sync_runs_update" ON public.sync_runs
  FOR UPDATE TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "sync_runs_delete" ON public.sync_runs;
CREATE POLICY "sync_runs_delete" ON public.sync_runs
  FOR DELETE TO service_role USING (true);

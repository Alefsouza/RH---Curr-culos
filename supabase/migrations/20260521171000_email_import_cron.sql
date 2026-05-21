-- Enable required extensions
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron SCHEMA extensions;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Extensions might require superuser privileges to create. Continuing...';
END $do$;

-- Create email_importacoes table
CREATE TABLE IF NOT EXISTS public.email_importacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gmail_message_id TEXT UNIQUE NOT NULL,
    gmail_thread_id TEXT,
    remetente TEXT,
    assunto TEXT,
    recebido_em TIMESTAMPTZ,
    processado_em TIMESTAMPTZ DEFAULT NOW(),
    status TEXT CHECK (status IN ('processando', 'sucesso', 'erro', 'sem_anexo_valido', 'sem_vaga_compativel', 'nao_qualificado')),
    erro_detalhes TEXT,
    candidato_id UUID REFERENCES public.candidatos(id) ON DELETE SET NULL,
    vaga_id_identificada UUID REFERENCES public.vagas(id) ON DELETE SET NULL,
    confianca_identificacao TEXT,
    justificativa_ia TEXT,
    anexo_filename TEXT,
    anexo_storage_path TEXT,
    user_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE
);

-- Enable RLS and Policies
ALTER TABLE public.email_importacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_importacoes_select" ON public.email_importacoes;
CREATE POLICY "email_importacoes_select" ON public.email_importacoes
    FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Unschedule cron job if exists to make it idempotent
DO $$
BEGIN
    PERFORM cron.unschedule('gmail-poll-curriculos-cron');
EXCEPTION WHEN OTHERS THEN
    -- Ignore if not exists or cron extension is not available
END $$;

-- Schedule the cron job using pg_net
DO $$
DECLARE
    auth_header text;
    query text;
BEGIN
    -- Dynamically read the service role key from settings if available
    auth_header := 'Bearer ' || coalesce(current_setting('app.settings.service_role_key', true), '');
    
    -- Build the pg_net query
    query := format('SELECT net.http_post(url:=''https://egferpbppisambawnhke.supabase.co/functions/v1/gmail-poll-curriculos'', headers:=jsonb_build_object(''Content-Type'', ''application/json'', ''Authorization'', %L))', auth_header);
    
    -- Schedule to run every 2 minutes
    PERFORM cron.schedule('gmail-poll-curriculos-cron', '*/2 * * * *', query);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to schedule cron job: %', SQLERRM;
END $$;

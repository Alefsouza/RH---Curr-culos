-- Unschedule existing cron job if present (idempotent)
DO $$
BEGIN
    PERFORM cron.unschedule('sync-outlook-cvs-cron');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Schedule sync-outlook-cvs every 15 minutes using pg_net
DO $$
DECLARE
    auth_header text;
    query text;
BEGIN
    auth_header := 'Bearer ' || coalesce(current_setting('app.settings.service_role_key', true), '');
    query := format(
      'SELECT net.http_post(url:=''https://egferpbppisambawnhke.supabase.co/functions/v1/sync-outlook-cvs'', headers:=jsonb_build_object(''Content-Type'', ''application/json'', ''Authorization'', %L))',
      auth_header
    );
    PERFORM cron.schedule('sync-outlook-cvs-cron', '*/15 * * * *', query);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Failed to schedule cron job: %', SQLERRM;
END $$;

-- Dispara uma rodada de teste chamando a edge function sync-outlook-cvs
DO $$
DECLARE
    auth_header text;
BEGIN
    auth_header := 'Bearer ' || coalesce(current_setting('app.settings.service_role_key', true), '');
    PERFORM net.http_post(
        url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/sync-outlook-cvs',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', auth_header),
        body := '{}'::jsonb
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Falha ao acionar sync-outlook-cvs: %', SQLERRM;
END $$;

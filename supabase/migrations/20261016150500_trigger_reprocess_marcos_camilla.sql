-- Migração para disparar reprocessamento dos e-mails marcos_camilla
-- (45ae0f1e-2cd6-42ad-bd63-03dc110ffeeb e 92d75e76-06e4-476e-a320-10957c3a5f7a)
DO $$
DECLARE
  v_res text;
BEGIN
  -- Faz chamada HTTP POST para a edge function sync-outlook-cvs passando os IDs
  PERFORM net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/sync-outlook-cvs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'reprocessEmailImportIds', jsonb_build_array(
        '45ae0f1e-2cd6-42ad-bd63-03dc110ffeeb',
        '92d75e76-06e4-476e-a320-10957c3a5f7a'
      )
    ),
    timeout_milliseconds := 120000
  );
END $$;

-- Migration: 20261013201000_check_anon_key_and_trigger.sql
DO $$
DECLARE
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnZmVycGJwcGlzYW1iYXduaGtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUyNzYxMjQsImV4cCI6MjA2MDg1MjEyNH0.u7zY-u6_Q...'; -- from client.ts
  req_id bigint;
  url text;
BEGIN
  url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-candidato';
  
  -- Buscar anon key real de vault ou app se houver, ou chamar direto
  req_id := net.http_post(
    url := url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'candidate_id', '08ba889b-562d-4ad8-bae7-0d857a6826d8',
      'force_reextract', false
    ),
    timeout_milliseconds := 60000
  );

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'trigger_valdecir_anon',
    jsonb_build_object('req_id', req_id, 'url', url)
  );
END $$;

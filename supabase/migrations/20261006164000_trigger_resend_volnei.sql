-- Migration para disparar o reenvio via net.http_post para Volnei Vieira Santos Junior
-- Candidato ID: 2b812eed-1a00-407d-b3ef-555ed1088ad6
-- Etapa Entrevista Gestor ID: 1538526f-5b6b-49ab-a3fa-6dc5fe6625d7
DO $$
DECLARE
  req_id bigint;
BEGIN
  req_id := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/enviar-whatsapp',
    body := '{"candidato_id": "2b812eed-1a00-407d-b3ef-555ed1088ad6", "etapa_id": "1538526f-5b6b-49ab-a3fa-6dc5fe6625d7"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 30000
  );
  RAISE NOTICE 'pg_net request_id disparada para reenvio do Volnei: %', req_id;
END $$;

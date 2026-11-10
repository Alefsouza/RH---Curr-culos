-- Dispara reanálise da Catiana Pereira Santos com o motor atualizado e grava relatório
DO $$
DECLARE
  v_req bigint;
BEGIN
  v_req := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-candidato',
    body := '{"candidate_id": "05dd2f8b-5637-4124-a781-35c375cc754a", "force_reextract": false}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 120000
  );

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'trigger_reanalise_catiana_v710',
    jsonb_build_object(
      'req_id', v_req,
      'candidate_id', '05dd2f8b-5637-4124-a781-35c375cc754a',
      'disparado_em', now()
    )
  );

  PERFORM pg_sleep(8);
END $$;

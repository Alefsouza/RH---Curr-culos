-- Dispara reanálise do candidato João Rafael dos Santos via reanalisar-candidato
DO $$
DECLARE
  req_id bigint;
BEGIN
  req_id := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-candidato',
    body := '{"candidate_id": "548de618-e358-4436-9cb4-c408fe8708b4", "force_reextract": false}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 120000
  );

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'trigger_joao_rafael_reanalysis_v0670',
    jsonb_build_object(
      'req_id', req_id,
      'disparado_em', now()
    )
  );
END $$;

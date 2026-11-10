-- Disparar reanálise da Catiana Pereira Santos usando a URL real da cloud
DO $$
DECLARE
  v_url text := 'https://egferpbppisambawnhke.supabase.co';
  v_cand_id uuid := '05dd2f8b-5637-4124-a781-35c375cc754a';
  v_vaga_lavador_id uuid := '144c95f9-c47a-4619-925b-2d8ba3386973';
  v_req_id bigint;
BEGIN
  SELECT net.http_post(
    url := v_url || '/functions/v1/reanalisar-candidato',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'candidate_id', v_cand_id,
      'target_vaga_id', v_vaga_lavador_id
    ),
    timeout_milliseconds := 120000
  ) INTO v_req_id;

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'trigger_reanalise_catiana_v711_fixed',
    jsonb_build_object('candidate_id', v_cand_id, 'request_id', v_req_id, 'url', v_url)
  );

  RAISE NOTICE 'Disparada reanálise de Catiana Pereira Santos (req_id: %)', v_req_id;
END $$;

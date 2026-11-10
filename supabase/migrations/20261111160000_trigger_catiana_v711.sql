-- Disparar reanálise da Catiana Pereira Santos via pg_net chamando a edge function reanalisar-candidato
DO $$
DECLARE
  v_url text;
  v_service_key text;
  v_cand_id uuid := '05dd2f8b-5637-4124-a781-35c375cc754a';
  v_vaga_lavador_id uuid := '144c95f9-c47a-4619-925b-2d8ba3386973';
  v_req_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  IF v_url IS NULL THEN
    v_url := 'https://supabase.curriculosrh.intern';
  END IF;

  SELECT decrypted_secret INTO v_service_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_service_key IS NULL THEN
    SELECT decrypted_secret INTO v_service_key FROM vault.decrypted_secrets WHERE name = 'service_key' LIMIT 1;
  END IF;

  -- Dispara reanálise da Catiana forçando vaga_id se necessário ou deixando reanalisar-candidato escolher
  -- Nota: reanalisar-candidato aceita candidate_id e target_vaga_id
  SELECT net.http_post(
    url := v_url || '/functions/v1/reanalisar-candidato',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_service_key, '')
    ),
    body := jsonb_build_object(
      'candidate_id', v_cand_id,
      'target_vaga_id', v_vaga_lavador_id
    ),
    timeout_milliseconds := 60000
  ) INTO v_req_id;

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'trigger_reanalise_catiana_v711',
    jsonb_build_object('candidate_id', v_cand_id, 'request_id', v_req_id, 'url', v_url)
  );

  RAISE NOTICE 'Disparada reanálise de Catiana Pereira Santos (req_id: %)', v_req_id;
END $$;

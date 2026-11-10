-- Disparar reanálise da Catiana chamando diretamente analisar-cv-criterios com a vaga de Lavador de ônibus Leste
DO $$
DECLARE
  v_url text := 'https://egferpbppisambawnhke.supabase.co';
  v_cand_id uuid := '05dd2f8b-5637-4124-a781-35c375cc754a';
  v_vaga_lavador_id uuid := '144c95f9-c47a-4619-925b-2d8ba3386973';
  v_service_key text;
  v_req_id bigint;
BEGIN
  -- Atualizar a vaga_id da Catiana para Lavador de ônibus Leste
  UPDATE public.candidatos
  SET vaga_id = v_vaga_lavador_id
  WHERE id = v_cand_id;

  SELECT decrypted_secret INTO v_service_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_service_key IS NULL THEN
    SELECT decrypted_secret INTO v_service_key FROM vault.decrypted_secrets WHERE name = 'service_key' LIMIT 1;
  END IF;

  SELECT net.http_post(
    url := v_url || '/functions/v1/analisar-cv-criterios',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_service_key, '')
    ),
    body := jsonb_build_object(
      'cv_id', v_cand_id,
      'vaga_id', v_vaga_lavador_id
    ),
    timeout_milliseconds := 120000
  ) INTO v_req_id;

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'trigger_analise_catiana_lavador_v711',
    jsonb_build_object('candidate_id', v_cand_id, 'vaga_id', v_vaga_lavador_id, 'request_id', v_req_id)
  );

  RAISE NOTICE 'Disparada análise direta da Catiana em Lavador de ônibus Leste (req_id: %)', v_req_id;
END $$;

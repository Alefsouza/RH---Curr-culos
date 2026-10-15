-- Migration: 20261015215000_invoke_reanalisar_and_verify.sql
DO $$
DECLARE
  req_id bigint;
  v_resp RECORD;
  v_attempts int := 0;
  v_done boolean := false;
  v_analise RECORD;
BEGIN
  req_id := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-candidato',
    body := '{"candidate_id": "0c311d44-0d74-4a1f-9bc1-a114fad70ff0"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 120000
  );

  WHILE v_attempts < 45 AND NOT v_done LOOP
    PERFORM pg_sleep(2);
    v_attempts := v_attempts + 1;

    SELECT id, status_code, content, error_msg 
    INTO v_resp
    FROM net._http_response
    WHERE id = req_id;

    IF v_resp.id IS NOT NULL THEN
      v_done := true;
    END IF;
  END LOOP;

  SELECT id, candidato_id, vaga_id, resultado, detalhes, criado_em
  INTO v_analise
  FROM public.analises
  WHERE candidato_id = '0c311d44-0d74-4a1f-9bc1-a114fad70ff0'
  ORDER BY criado_em DESC
  LIMIT 1;

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'final_reanalise_verify',
    jsonb_build_object(
      'req_id', req_id,
      'status_code', v_resp.status_code,
      'error_msg', v_resp.error_msg,
      'resp_content', substring(COALESCE(v_resp.content, '') from 1 for 1000),
      'analise_id', v_analise.id,
      'analise_resultado', v_analise.resultado,
      'analise_criado_em', v_analise.criado_em,
      'attempts', v_attempts
    )
  );

  IF v_resp.status_code IS NULL OR v_resp.status_code != 200 THEN
    RAISE EXCEPTION 'reanalisar-candidato falhou com status %: % (err: %)', 
      v_resp.status_code, v_resp.content, v_resp.error_msg;
  END IF;

  -- Verifica se a análise foi atualizada/criada com timestamp recente (criado_em >= hoje 2026-10-15)
  IF v_analise.criado_em < '2026-10-15 00:00:00+00' THEN
    RAISE EXCEPTION 'A análise não foi gravada com criado_em de hoje: %', v_analise.criado_em;
  END IF;
END $$;

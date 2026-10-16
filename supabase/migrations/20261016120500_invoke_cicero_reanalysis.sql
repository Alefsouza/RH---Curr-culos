-- Migration: 20261016120500_invoke_cicero_reanalysis.sql
-- Executa chamada de reanálise para Cícero Crisostomo dos Santos (0eb00581-a1db-4172-b761-a409dd02761e)
-- com force_reextract = false
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
    body := '{"candidate_id": "0eb00581-a1db-4172-b761-a409dd02761e", "force_reextract": false}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 60000
  );

  WHILE v_attempts < 25 AND NOT v_done LOOP
    SELECT id, status_code, content, error_msg 
    INTO v_resp
    FROM net._http_response
    WHERE id = req_id;

    IF v_resp.id IS NOT NULL THEN
      v_done := true;
    ELSE
      PERFORM pg_sleep(2);
      v_attempts := v_attempts + 1;
    END IF;
  END LOOP;

  SELECT id, candidato_id, vaga_id, resultado, detalhes, criado_em
  INTO v_analise
  FROM public.analises
  WHERE candidato_id = '0eb00581-a1db-4172-b761-a409dd02761e'
  ORDER BY criado_em DESC
  LIMIT 1;

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'cicero_reanalysis_result',
    jsonb_build_object(
      'req_id', req_id,
      'resp_status_code', v_resp.status_code,
      'resp_content', substring(COALESCE(v_resp.content, '') from 1 for 1000),
      'resp_error_msg', v_resp.error_msg,
      'analise_id', v_analise.id,
      'analise_resultado', v_analise.resultado,
      'analise_motivo', v_analise.detalhes->>'motivo',
      'analise_criado_em', v_analise.criado_em,
      'attempts', v_attempts
    )
  );

  IF v_resp.status_code IS NOT NULL AND v_resp.status_code != 200 THEN
    RAISE EXCEPTION 'reanalisar-candidato retornou status %: %', v_resp.status_code, v_resp.content;
  END IF;

  IF v_resp.error_msg IS NOT NULL AND v_resp.error_msg != '' THEN
    RAISE EXCEPTION 'net.http_post error: %', v_resp.error_msg;
  END IF;
END $$;

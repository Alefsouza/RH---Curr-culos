-- Migration: 20261015213000_test_call_reanalisar.sql
DO $$
DECLARE
  v_req_id bigint;
  v_resp RECORD;
  v_waited int := 0;
  v_analise RECORD;
BEGIN
  -- Dispara POST para reanalisar-candidato
  v_req_id := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-candidato',
    body := '{"candidate_id":"0c311d44-0d74-4a1f-9bc1-a114fad70ff0","force_reextract":false}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 60000
  );

  -- Espera pela resposta no net._http_response
  WHILE v_waited < 25 LOOP
    SELECT id, status_code, content, error_msg
    INTO v_resp
    FROM net._http_response
    WHERE id = v_req_id;

    IF v_resp.id IS NOT NULL THEN
      EXIT;
    END IF;

    PERFORM pg_sleep(2);
    v_waited := v_waited + 1;
  END LOOP;

  -- Busca última análise gravada
  SELECT id, candidato_id, vaga_id, resultado, detalhes, criado_em
  INTO v_analise
  FROM public.analises
  WHERE candidato_id = '0c311d44-0d74-4a1f-9bc1-a114fad70ff0'
  ORDER BY criado_em DESC
  LIMIT 1;

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'test_call_reanalisar_0c311d44',
    jsonb_build_object(
      'req_id', v_req_id,
      'status_code', v_resp.status_code,
      'resp_error_msg', v_resp.error_msg,
      'resp_content', substring(COALESCE(v_resp.content, '') from 1 for 1000),
      'analise_id', v_analise.id,
      'analise_resultado', v_analise.resultado,
      'analise_criado_em', v_analise.criado_em
    )
  );

  IF v_resp.status_code = 503 THEN
    RAISE EXCEPTION 'Ainda falhando com 503 BOOT_ERROR: %', v_resp.content;
  END IF;
END $$;

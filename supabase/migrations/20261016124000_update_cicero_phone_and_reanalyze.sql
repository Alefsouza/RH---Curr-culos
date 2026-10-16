-- Migration: 20261016124000_update_cicero_phone_and_reanalyze.sql
-- 1. Garante telefone e telefone_normalizado atualizados para Cícero Crisostomo dos Santos
UPDATE public.candidatos
SET
  telefone = '11953869329',
  telefone_normalizado = '11953869329',
  dados_extraidos = jsonb_set(
    jsonb_set(
      COALESCE(dados_extraidos, '{}'::jsonb),
      '{telefone}',
      '"11953869329"'::jsonb
    ),
    '{telefones_celulares}',
    '["11953869329"]'::jsonb
  )
WHERE id = '0eb00581-a1db-4172-b761-a409dd02761e';

-- 2. Dispara a reanálise de Cícero para Motorista Cursino (4c4239c0-fd38-47e7-92fe-9bb5a3b02db2)
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
    'cicero_post_fix_reanalysis',
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

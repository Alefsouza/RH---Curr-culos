-- Migration: 20261015213500_check_response_status.sql
DO $$
DECLARE
  v_resp RECORD;
  v_analise RECORD;
BEGIN
  SELECT id, status_code, content, error_msg, created
  INTO v_resp
  FROM net._http_response
  WHERE id = 114924;

  SELECT id, candidato_id, vaga_id, resultado, detalhes, criado_em
  INTO v_analise
  FROM public.analises
  WHERE candidato_id = '0c311d44-0d74-4a1f-9bc1-a114fad70ff0'
  ORDER BY criado_em DESC
  LIMIT 1;

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'check_response_114924',
    jsonb_build_object(
      'status_code', v_resp.status_code,
      'error_msg', v_resp.error_msg,
      'content', substring(COALESCE(v_resp.content, '') from 1 for 1000),
      'analise_id', v_analise.id,
      'analise_resultado', v_analise.resultado,
      'analise_criado_em', v_analise.criado_em,
      'analise_detalhes', v_analise.detalhes
    )
  );

  IF v_resp.status_code = 503 THEN
    RAISE EXCEPTION 'Ainda 503: %', v_resp.content;
  END IF;
END $$;

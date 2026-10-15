-- Migration: 20261015214500_check_req_114940.sql
DO $$
DECLARE
  v_resp RECORD;
  v_analise RECORD;
BEGIN
  SELECT id, status_code, content, error_msg 
  INTO v_resp
  FROM net._http_response
  WHERE id = 114940;

  SELECT id, candidato_id, vaga_id, resultado, detalhes, criado_em
  INTO v_analise
  FROM public.analises
  WHERE candidato_id = '0c311d44-0d74-4a1f-9bc1-a114fad70ff0'
  ORDER BY criado_em DESC
  LIMIT 1;

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'check_req_114940_result',
    jsonb_build_object(
      'req_id', 114940,
      'status_code', v_resp.status_code,
      'resp_content', substring(COALESCE(v_resp.content, '') from 1 for 1000),
      'error_msg', v_resp.error_msg,
      'analise_id', v_analise.id,
      'analise_resultado', v_analise.resultado,
      'analise_criado_em', v_analise.criado_em
    )
  );

  RAISE NOTICE 'CHECK 114940: status=%, analise_criado_em=%, content=%', 
    v_resp.status_code, v_analise.criado_em, substring(COALESCE(v_resp.content, '') from 1 for 200);
END $$;

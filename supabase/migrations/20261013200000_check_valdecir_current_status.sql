-- Migration: 20261013200000_check_valdecir_current_status.sql
DO $$
DECLARE
  v_cand RECORD;
  v_vaga RECORD;
  v_analise RECORD;
  v_net RECORD;
BEGIN
  SELECT id, nome, vaga_id, proximidade, dados_extraidos INTO v_cand
  FROM public.candidatos
  WHERE id = '08ba889b-562d-4ad8-bae7-0d857a6826d8';

  SELECT id, titulo INTO v_vaga
  FROM public.vagas
  WHERE id = v_cand.vaga_id;

  SELECT id, vaga_id, resultado, detalhes, criado_em INTO v_analise
  FROM public.analises
  WHERE candidato_id = '08ba889b-562d-4ad8-bae7-0d857a6826d8'
  ORDER BY criado_em DESC
  LIMIT 1;

  SELECT id, status_code, substring(content from 1 for 400) as resp, error_msg INTO v_net
  FROM net._http_response
  ORDER BY id DESC
  LIMIT 1;

  RAISE NOTICE 'VALDECIR: vaga=%, titulo=%', v_cand.vaga_id, v_vaga.titulo;
  RAISE NOTICE 'ANALISE: vaga_id=%, resultado=%, data=%', v_analise.vaga_id, v_analise.resultado, v_analise.criado_em;
  RAISE NOTICE 'NET: status=%, err=%, resp=%', v_net.status_code, v_net.error_msg, v_net.resp;
END $$;

-- Migration: 20261013200200_debug_audit_table.sql
CREATE TABLE IF NOT EXISTS public._debug_audit (
  id uuid primary key default gen_random_uuid(),
  tag text,
  info jsonb,
  created_at timestamptz default now()
);

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

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'valdecir_status',
    jsonb_build_object(
      'candidato_nome', v_cand.nome,
      'vaga_id', v_cand.vaga_id,
      'vaga_titulo', v_vaga.titulo,
      'proximidade', v_cand.proximidade,
      'analise_id', v_analise.id,
      'analise_vaga_id', v_analise.vaga_id,
      'analise_resultado', v_analise.resultado,
      'analise_criado_em', v_analise.criado_em,
      'analise_detalhes', v_analise.detalhes,
      'net_status', v_net.status_code,
      'net_error', v_net.error_msg,
      'net_resp', v_net.resp
    )
  );
END $$;

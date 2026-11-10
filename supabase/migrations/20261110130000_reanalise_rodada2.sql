-- Migration: Reprocessar os 10 candidatos restantes em erro_reanalise
-- e Thalia Nabor Costa especificamente (caso real que precisa de análise e posicionamento)

do $$
declare
  v_req_reanalise_2 bigint;
  v_req_thalia bigint;
begin
  -- 1. Reprocessar Thalia com reanalisar-candidato direto
  v_req_thalia := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-candidato',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('candidate_id', '9e81f387-b043-4bbd-aa4b-54abef560b4c', 'force_reextract', false),
    timeout_milliseconds := 120000
  );

  -- 2. Reprocessar lote restante de erro_reanalise
  v_req_reanalise_2 := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-erro-reanalise',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('limit', 100),
    timeout_milliseconds := 240000
  );

  insert into public.operacoes_v0704_audit (tag, req_id, info)
  values
    ('reanalise_thalia_direta', v_req_thalia, jsonb_build_object('candidate_id', '9e81f387-b043-4bbd-aa4b-54abef560b4c')),
    ('reanalise_lote_rodada2', v_req_reanalise_2, jsonb_build_object('limit', 100));

  raise notice 'Reanálise rodada 2 disparada: Thalia req=%, Lote req=%', v_req_thalia, v_req_reanalise_2;
end $$;

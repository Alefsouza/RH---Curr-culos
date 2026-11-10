-- Migration: Buscar e-mail do Rian por assunto ou nome
-- ryanirt02@gmail.com pode ter chegado com 'Rian', 'Gouveia' ou 'Sapopemba' no assunto
do $$
declare
  v_req_rian_assunto bigint;
  v_req_rian_nome bigint;
begin
  v_req_rian_assunto := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/sync-outlook-cvs',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'diagnoseGraph', true,
      'searchQuery', 'Sapopemba'
    ),
    timeout_milliseconds := 120000
  );

  v_req_rian_nome := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/sync-outlook-cvs',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'diagnoseGraph', true,
      'searchQuery', 'Gouveia'
    ),
    timeout_milliseconds := 120000
  );

  insert into public.operacoes_v0704_audit (tag, req_id, info)
  values
    ('diag_rian_sapopemba', v_req_rian_assunto, jsonb_build_object('query', 'Sapopemba')),
    ('diag_rian_gouveia', v_req_rian_nome, jsonb_build_object('query', 'Gouveia'));

  raise notice 'Buscas ampliadas para Rian disparadas: req Sapopemba=%, req Gouveia=%', v_req_rian_assunto, v_req_rian_nome;
end $$;

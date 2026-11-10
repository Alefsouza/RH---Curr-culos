-- Migration: Buscar por 'ryanirt02' ou 'ryan' ou 'auxiliar de limpeza de frota'
do $$
declare
  v_req_user bigint;
  v_req_subject bigint;
begin
  v_req_user := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/sync-outlook-cvs',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'diagnoseGraph', true,
      'searchQuery', 'ryanirt02'
    ),
    timeout_milliseconds := 120000
  );

  v_req_subject := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/sync-outlook-cvs',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'diagnoseGraph', true,
      'searchQuery', 'auxiliar de limpeza de frota'
    ),
    timeout_milliseconds := 120000
  );

  insert into public.operacoes_v0704_audit (tag, req_id, info)
  values
    ('diag_rian_user', v_req_user, jsonb_build_object('query', 'ryanirt02')),
    ('diag_rian_frota', v_req_subject, jsonb_build_object('query', 'auxiliar de limpeza de frota'));

  raise notice 'Buscas ryanirt02 e frota disparadas: req ryanirt=%, req frota=%', v_req_user, v_req_subject;
end $$;

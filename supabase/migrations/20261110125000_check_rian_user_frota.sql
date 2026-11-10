-- Migration: Checar resultados de busca ryanirt02 e frota
do $$
declare
  v_req_user bigint;
  v_req_frota bigint;
  v_resp_user record;
  v_resp_frota record;
begin
  select req_id into v_req_user from public.operacoes_v0704_audit where tag = 'diag_rian_user' order by id desc limit 1;
  select req_id into v_req_frota from public.operacoes_v0704_audit where tag = 'diag_rian_frota' order by id desc limit 1;

  select status_code, content::jsonb as json_content into v_resp_user from net._http_response where id = v_req_user;
  select status_code, content::jsonb as json_content into v_resp_frota from net._http_response where id = v_req_frota;

  raise notice 'USER STATUS %: %', v_resp_user.status_code, left(v_resp_user.json_content::text, 400);
  raise notice 'FROTA STATUS %: %', v_resp_frota.status_code, left(v_resp_frota.json_content::text, 400);

  insert into public._debug_audit (tag, info)
  values ('diag_rian_user_frota_results', jsonb_build_object(
    'user', v_resp_user.json_content,
    'frota', v_resp_frota.json_content
  ));
end $$;

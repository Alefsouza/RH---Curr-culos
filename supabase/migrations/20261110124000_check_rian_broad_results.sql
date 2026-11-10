-- Migration: Checar resultados das buscas ampliadas por Rian
do $$
declare
  v_req_sap bigint;
  v_req_gou bigint;
  v_resp_sap record;
  v_resp_gou record;
begin
  select req_id into v_req_sap from public.operacoes_v0704_audit where tag = 'diag_rian_sapopemba' order by id desc limit 1;
  select req_id into v_req_gou from public.operacoes_v0704_audit where tag = 'diag_rian_gouveia' order by id desc limit 1;

  select status_code, content::jsonb as json_content into v_resp_sap from net._http_response where id = v_req_sap;
  select status_code, content::jsonb as json_content into v_resp_gou from net._http_response where id = v_req_gou;

  raise notice 'SAPOPEMBA STATUS %: %', v_resp_sap.status_code, left(v_resp_sap.json_content::text, 400);
  raise notice 'GOUVEIA STATUS %: %', v_resp_gou.status_code, left(v_resp_gou.json_content::text, 400);

  insert into public._debug_audit (tag, info)
  values ('diag_rian_broad_results', jsonb_build_object(
    'sapopemba', v_resp_sap.json_content,
    'gouveia', v_resp_gou.json_content
  ));
end $$;

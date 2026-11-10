-- Migration: Leitura do diagnóstico Graph de Catia e Rian
-- Aguarda brevemente e insere o resultado em _debug_audit

do $$
declare
  v_req_catia bigint;
  v_req_rian bigint;
  v_resp_catia record;
  v_resp_rian record;
begin
  select req_id into v_req_catia from public.operacoes_v0704_audit where tag = 'diag_catia' order by id desc limit 1;
  select req_id into v_req_rian  from public.operacoes_v0704_audit where tag = 'diag_catia' order by id desc limit 1;

  select status_code, content::jsonb as json_content into v_resp_catia from net._http_response where id = v_req_catia;
  select status_code, content::jsonb as json_content into v_resp_rian  from net._http_response where id = v_req_rian;

  insert into public._debug_audit (tag, info)
  values ('diag_graph_respostas', jsonb_build_object(
    'catia_status', v_resp_catia.status_code,
    'catia_content', v_resp_catia.json_content,
    'rian_status', v_resp_rian.status_code,
    'rian_content', v_resp_rian.json_content
  ));

  raise notice 'DIAG GRAPH: Catia status=%, Rian status=%', v_resp_catia.status_code, v_resp_rian.status_code;
end $$;

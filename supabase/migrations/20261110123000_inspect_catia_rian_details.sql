-- Migration: Inspecionar detalhes de Catia e Rian em _debug_audit
-- e levantar os detalhes do anexo de Catia
do $$
declare
  v_diag record;
  v_catia_att jsonb;
  v_rian_msgs jsonb;
  v_rian_req bigint;
  v_resp_rian record;
begin
  select req_id into v_rian_req from public.operacoes_v0704_audit where tag = 'diag_rian' order by id desc limit 1;
  select status_code, content::jsonb as json_content into v_resp_rian from net._http_response where id = v_rian_req;

  select info into v_diag from public._debug_audit where tag = 'diag_graph_respostas' order by id desc limit 1;
  v_catia_att := v_diag.info #> '{catia_content,diagResult,message,attachments}';

  raise notice 'ANEXOS CATIA: %', v_catia_att;
  raise notice 'RIAN STATUS: %, CONTENT: %', v_resp_rian.status_code, left(v_resp_rian.json_content::text, 400);

  insert into public._debug_audit (tag, info)
  values ('diag_rian_especifico', jsonb_build_object(
    'status', v_resp_rian.status_code,
    'content', v_resp_rian.json_content,
    'catia_attachments', v_catia_att
  ));
end $$;

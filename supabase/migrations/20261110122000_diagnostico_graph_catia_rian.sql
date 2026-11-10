-- Migration: Diagnosticar mensagem da Catia e buscar mensagem do Rian no MS Graph
-- O disparo anterior para Catia deu erro ou sem anexo. Vamos chamar diagnoseGraph com:
-- messageId: 'AAMkAGEwOGY5NGUxLTA2NDMtNDIzMS04ZDlhLTJhM2VlODAwZGIwNABGAAAAAADk_u7K-mXhTqS3PqWf6KInBwDM7q2E9AisTp0vY-xR3F0LAAAAAAEMAADM7q2E9AisTp0vY-xR3F0LAALi8iYRAAA='
-- E buscar Rian por ryanirt02@gmail.com em todas as pastas.

do $$
declare
  v_req_diag_catia bigint;
  v_req_diag_rian bigint;
begin
  -- 1. Diagnóstico da mensagem de Catia
  v_req_diag_catia := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/sync-outlook-cvs',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'diagnoseGraph', true,
      'messageId', 'AAMkAGEwOGY5NGUxLTA2NDMtNDIzMS04ZDlhLTJhM2VlODAwZGIwNABGAAAAAADk_u7K-mXhTqS3PqWf6KInBwDM7q2E9AisTp0vY-xR3F0LAAAAAAEMAADM7q2E9AisTp0vY-xR3F0LAALi8iYRAAA='
    ),
    timeout_milliseconds := 120000
  );

  -- 2. Diagnóstico/busca de Rian Gouveia
  v_req_diag_rian := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/sync-outlook-cvs',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'diagnoseGraph', true,
      'searchQuery', 'ryanirt02@gmail.com'
    ),
    timeout_milliseconds := 120000
  );

  insert into public.operacoes_v0704_audit (tag, req_id, info)
  values
    ('diag_catia', v_req_diag_catia, jsonb_build_object('message_id', 'catia')),
    ('diag_rian', v_req_diag_rian, jsonb_build_object('query', 'ryanirt02@gmail.com'));

  raise notice 'Diagnósticos Graph disparados: Catia req=%, Rian req=%', v_req_diag_catia, v_req_diag_rian;
end $$;

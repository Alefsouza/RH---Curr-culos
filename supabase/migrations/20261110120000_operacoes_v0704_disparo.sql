-- Migration: Operações pendentes da v0.0.704
-- 1. Reprocessar Catia Pereira (c2cad0fe) e Rian Gouveia
-- 2. Disparar reanálise dos 29 candidatos erro_reanalise + 1 aguardando sem análise (Thalia 9e81f387)
-- Usando net.http_post para invocar sync-outlook-cvs e reanalisar-erro-reanalise
-- Protegidos intocados: Daniel (3c9a24ae), Igor (46ab0280), Cristiano (18cb75de), Eduardo (cdbbf741), João Rafael (548de618)

create table if not exists public.operacoes_v0704_audit (
  id serial primary key,
  tag text not null,
  req_id bigint,
  info jsonb,
  created_at timestamptz default now()
);

alter table public.operacoes_v0704_audit enable row level security;
drop policy if exists "operacoes_v0704_select" on public.operacoes_v0704_audit;
create policy "operacoes_v0704_select" on public.operacoes_v0704_audit for select to authenticated using (true);

do $$
declare
  v_req_catia bigint;
  v_req_rian bigint;
  v_req_reanalise bigint;
begin
  -- 1. Disparar reprocessamento de Catia Pereira (id c2cad0fe-e4a8-4443-85b4-f3c5f2ce0cbe)
  v_req_catia := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/sync-outlook-cvs',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('reprocessEmailImportIds', jsonb_build_array('c2cad0fe-e4a8-4443-85b4-f3c5f2ce0cbe'::text)),
    timeout_milliseconds := 120000
  );

  insert into public.operacoes_v0704_audit (tag, req_id, info)
  values ('reprocess_catia', v_req_catia, jsonb_build_object('import_id', 'c2cad0fe-e4a8-4443-85b4-f3c5f2ce0cbe'));

  -- 2. Disparar sincronização/busca do e-mail do Rian Gouveia
  v_req_rian := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/sync-outlook-cvs',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('importarEmailsManualmente', true, 'searchSender', 'ryanirt02@gmail.com'),
    timeout_milliseconds := 120000
  );

  insert into public.operacoes_v0704_audit (tag, req_id, info)
  values ('sync_rian', v_req_rian, jsonb_build_object('sender', 'ryanirt02@gmail.com'));

  -- 3. Disparar reanálise dos candidatos erro_reanalise (29 candidatos)
  v_req_reanalise := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-erro-reanalise',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('limit', 100),
    timeout_milliseconds := 240000
  );

  insert into public.operacoes_v0704_audit (tag, req_id, info)
  values ('lote_erro_reanalise', v_req_reanalise, jsonb_build_object('limit', 100));

  raise notice 'Operações v0.0.704 disparadas: Catia req=%, Rian req=%, Reanálise req=%', v_req_catia, v_req_rian, v_req_reanalise;
end $$;

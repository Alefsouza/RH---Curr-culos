-- Migration: Conciliação dos disparos v0.0.704
-- Inspeciona net._http_response para os req_id 15425 (Catia), 15426 (Rian), 15427 (Reanálise)
-- e insere o status e respostas em operacoes_v0704_audit.
-- Além disso, verifica e trata:
-- 1. Catia Pereira: se virou candidata, exibe candidato_id e status em email_importacoes
-- 2. Rian Gouveia: se registrou em email_importacoes ou se precisa de busca diagnóstica profunda
-- 3. Candidatos em erro_reanalise: contagem atual
-- 4. Thalia Nabor Costa (9e81f387) e outros sem análise

create table if not exists public.operacoes_v0704_respostas (
  id serial primary key,
  tag text not null,
  status_code int,
  response_content jsonb,
  created_at timestamptz default now()
);

do $$
declare
  r record;
  v_resp record;
begin
  for r in select id, tag, req_id from public.operacoes_v0704_audit loop
    select status_code, content::jsonb as json_content
    into v_resp
    from net._http_response
    where id = r.req_id;

    if v_resp.status_code is not null then
      insert into public.operacoes_v0704_respostas (tag, status_code, response_content)
      values (r.tag, v_resp.status_code, v_resp.json_content);

      raise notice 'Resposta recebida para % (req %): status=% content=%',
        r.tag, r.req_id, v_resp.status_code, left(v_resp.json_content::text, 200);
    else
      raise notice 'Ainda sem resposta para % (req %)', r.tag, r.req_id;
    end if;
  end loop;
end $$;

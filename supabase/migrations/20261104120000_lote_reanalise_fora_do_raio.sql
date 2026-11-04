-- Migration: Lote de reanálise dos candidatos ATIVOS fora do raio da própria vaga
-- Critério (= auditoria de distância): candidato ativo (não deletado, ativo_kanban) cuja
-- análise mais recente COM distância para a PRÓPRIA vaga atual tem distancia_km > raio_km da vaga.
-- Regra do usuário: raio_km nos critérios da vaga é o parâmetro definitivo.
-- Motorista Cursino e Motorista Leste com raio corrigido para 15 km.
-- Protegidos intocados: Daniel (3c9a24ae), Igor (46ab0280), Cristiano (18cb75de),
-- Eduardo (cdbbf741), João Rafael (548de618).
-- Não reexecuta mascaramento/reextração (force_reextract ausente = false).

create table if not exists public.reanalise_raio_lote (
  candidato_id uuid primary key,
  nome text,
  vaga_origem_id uuid,
  vaga_origem_titulo text,
  raio_km numeric,
  dist_anterior numeric,
  req_id bigint,
  status text not null default 'disparado',
  resultado text,
  vaga_destino_id uuid,
  vaga_destino_titulo text,
  dist_nova numeric,
  disparado_em timestamptz default now(),
  atualizado_em timestamptz
);

alter table public.reanalise_raio_lote enable row level security;

drop policy if exists "lote_raio_leitura_auth" on public.reanalise_raio_lote;
create policy "lote_raio_leitura_auth"
  on public.reanalise_raio_lote for select
  to authenticated
  using (true);

do $$
declare
  r record;
  v_req bigint;
  v_qtd int := 0;
begin
  for r in
    with dist as (
      select distinct on (a.candidato_id)
             a.candidato_id, a.vaga_id,
             (a.detalhes->>'distancia_km')::numeric as dist
      from public.analises a
      where a.vaga_id is not null
        and a.detalhes->>'distancia_km' ~ '^[0-9.]+$'
      order by a.candidato_id, a.criado_em desc
    )
    select c.id, c.nome, c.vaga_id, v.titulo,
           (v.criterios_qualificacao->>'raio_km')::numeric as raio,
           d.dist
    from public.candidatos c
    join dist d on d.candidato_id = c.id and d.vaga_id = c.vaga_id
    join public.vagas v on v.id = c.vaga_id
    where c.deleted_at is null
      and c.ativo_kanban is true
      and c.vaga_id is not null
      and v.criterios_qualificacao->>'raio_km' ~ '^[0-9.]+$'
      and d.dist > (v.criterios_qualificacao->>'raio_km')::numeric
      and c.id::text not like '3c9a24ae%'
      and c.id::text not like '46ab0280%'
      and c.id::text not like '18cb75de%'
      and c.id::text not like 'cdbbf741%'
      and c.id::text not like '548de618%'
      and not exists (
        select 1 from public.reanalise_raio_lote l where l.candidato_id = c.id
      )
    order by v.titulo, c.nome
  loop
    insert into public.reanalise_raio_lote
      (candidato_id, nome, vaga_origem_id, vaga_origem_titulo, raio_km, dist_anterior)
    values (r.id, r.nome, r.vaga_id, r.titulo, r.raio, r.dist)
    on conflict (candidato_id) do nothing;

    v_req := net.http_post(
      url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-candidato',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('candidate_id', r.id),
      timeout_milliseconds := 240000
    );

    update public.reanalise_raio_lote set req_id = v_req where candidato_id = r.id;
    v_qtd := v_qtd + 1;
    perform pg_sleep(1.0);
  end loop;

  insert into public._debug_audit (tag, info)
  values ('reanalise_raio_lote_disparo',
          jsonb_build_object('disparados', v_qtd, 'quando', now()));

  raise notice 'LOTE FORA DO RAIO: % candidatos disparados para reanalisar-candidato', v_qtd;
end $$;

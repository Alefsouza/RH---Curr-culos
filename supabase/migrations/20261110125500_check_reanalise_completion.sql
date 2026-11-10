-- Migration: Checar se a reanálise dos 29 candidatos erro_reanalise já concluiu
-- e o estado atual de erro_reanalise e aguardando sem análise.

do $$
declare
  v_req_reanalise bigint;
  v_resp_reanalise record;
  v_restantes_erro int;
  v_restantes_aguardando_sem_analise int;
  v_thalia record;
begin
  select req_id into v_req_reanalise
  from public.operacoes_v0704_audit
  where tag = 'lote_erro_reanalise'
  order by id desc limit 1;

  select status_code, content::jsonb as json_content
  into v_resp_reanalise
  from net._http_response
  where id = v_req_reanalise;

  select count(*) into v_restantes_erro
  from public.candidatos
  where motivo_inativo = 'erro_reanalise' and deleted_at is null;

  select count(*) into v_restantes_aguardando_sem_analise
  from public.candidatos c
  where c.deleted_at is null
    and c.motivo_inativo ilike '%aguardando%'
    and not exists (select 1 from public.analises a where a.candidato_id = c.id);

  select id, nome, motivo_inativo, ativo_kanban, vaga_id
  into v_thalia
  from public.candidatos
  where id = '9e81f387-b043-4bbd-aa4b-54abef560b4c';

  raise notice 'REANALISE LOTE STATUS %: %', v_resp_reanalise.status_code, left(v_resp_reanalise.json_content::text, 400);
  raise notice 'RESTANTES ERRO_REANALISE: %, RESTANTES AGUARDANDO SEM ANALISE: %', v_restantes_erro, v_restantes_aguardando_sem_analise;
  raise notice 'THALIA STATUS: vaga=%, ativo=%, motivo=%', v_thalia.vaga_id, v_thalia.ativo_kanban, v_thalia.motivo_inativo;

  insert into public._debug_audit (tag, info)
  values ('reanalise_lote_conclusao', jsonb_build_object(
    'http_status', v_resp_reanalise.status_code,
    'http_content', v_resp_reanalise.json_content,
    'restantes_erro', v_restantes_erro,
    'restantes_aguardando_sem_analise', v_restantes_aguardando_sem_analise,
    'thalia', jsonb_build_object(
      'id', v_thalia.id,
      'nome', v_thalia.nome,
      'vaga_id', v_thalia.vaga_id,
      'ativo_kanban', v_thalia.ativo_kanban,
      'motivo_inativo', v_thalia.motivo_inativo
    )
  ));
end $$;

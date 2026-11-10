-- Migration: Checar resultado da rodada 2 de reanálise e listar quem ainda está em erro_reanalise
do $$
declare
  v_req_thalia bigint;
  v_req_lote bigint;
  v_resp_thalia record;
  v_resp_lote record;
  v_restantes int;
  v_nomes text;
  v_thalia record;
  v_thalia_analises int;
begin
  select req_id into v_req_thalia from public.operacoes_v0704_audit where tag = 'reanalise_thalia_direta' order by id desc limit 1;
  select req_id into v_req_lote from public.operacoes_v0704_audit where tag = 'reanalise_lote_rodada2' order by id desc limit 1;

  select status_code, content::jsonb as json_content into v_resp_thalia from net._http_response where id = v_req_thalia;
  select status_code, content::jsonb as json_content into v_resp_lote from net._http_response where id = v_req_lote;

  select count(*) into v_restantes
  from public.candidatos
  where motivo_inativo = 'erro_reanalise' and deleted_at is null;

  select string_agg(nome || ' (' || left(id::text, 8) || ')', ', ') into v_nomes
  from public.candidatos
  where motivo_inativo = 'erro_reanalise' and deleted_at is null;

  select id, nome, motivo_inativo, ativo_kanban, vaga_id into v_thalia
  from public.candidatos
  where id = '9e81f387-b043-4bbd-aa4b-54abef560b4c';

  select count(*) into v_thalia_analises
  from public.analises
  where candidato_id = '9e81f387-b043-4bbd-aa4b-54abef560b4c';

  raise notice 'RODADA 2: Thalia HTTP %: %', v_resp_thalia.status_code, left(v_resp_thalia.json_content::text, 300);
  raise notice 'RODADA 2: Lote HTTP %: %', v_resp_lote.status_code, left(v_resp_lote.json_content::text, 300);
  raise notice 'RESTANTES ERRO_REANALISE (%): %', v_restantes, v_nomes;
  raise notice 'THALIA ATUAL: ativo=%, motivo=%, vaga=%, analises=%',
    v_thalia.ativo_kanban, v_thalia.motivo_inativo, v_thalia.vaga_id, v_thalia_analises;

  insert into public._debug_audit (tag, info)
  values ('reanalise_rodada2_status', jsonb_build_object(
    'restantes_count', v_restantes,
    'restantes_nomes', v_nomes,
    'thalia_analises', v_thalia_analises,
    'thalia', jsonb_build_object(
      'id', v_thalia.id,
      'nome', v_thalia.nome,
      'ativo', v_thalia.ativo_kanban,
      'motivo', v_thalia.motivo_inativo,
      'vaga', v_thalia.vaga_id
    )
  ));
end $$;

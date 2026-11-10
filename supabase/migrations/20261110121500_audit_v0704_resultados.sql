-- Migration: Análise aprofundada dos resultados da v0.0.704
-- Registra em _debug_audit o estado de Catia, Rian, erro_reanalise e e-mails perdidos.

do $$
declare
  v_catia record;
  v_rian record;
  v_erro_reanalise_count int;
  v_aguardando_sem_analise_count int;
  v_respostas jsonb;
  v_stats_emails jsonb;
begin
  -- 1. Status Catia
  select id, status, erro_detalhes, anexo_filename, candidato_id
  into v_catia
  from public.email_importacoes
  where id = 'c2cad0fe-e4a8-4443-85b4-f3c5f2ce0cbe';

  -- 2. Status Rian
  select id, status, erro_detalhes, anexo_filename, candidato_id
  into v_rian
  from public.email_importacoes
  where remetente ilike '%ryanirt02@gmail.com%' or assunto ilike '%Rian%'
  order by recebido_em desc limit 1;

  -- 3. Contagem erro_reanalise
  select count(*) into v_erro_reanalise_count
  from public.candidatos
  where motivo_inativo = 'erro_reanalise' and deleted_at is null;

  -- 4. Contagem aguardando sem analise
  select count(*) into v_aguardando_sem_analise_count
  from public.candidatos c
  where c.deleted_at is null
    and c.motivo_inativo ilike '%aguardando%'
    and not exists (select 1 from public.analises a where a.candidato_id = c.id);

  -- 5. Respostas HTTP da tabela operacoes_v0704_respostas
  select jsonb_agg(jsonb_build_object('tag', tag, 'status', status_code, 'content', response_content))
  into v_respostas
  from public.operacoes_v0704_respostas;

  -- 6. Agrupamento de e-mails perdidos
  select jsonb_object_agg(status, cnt)
  into v_stats_emails
  from (
    select status, count(*) as cnt
    from public.email_importacoes
    group by status
  ) s;

  insert into public._debug_audit (tag, info)
  values ('audit_v0704_resultados', jsonb_build_object(
    'catia', jsonb_build_object(
      'id', v_catia.id,
      'status', v_catia.status,
      'erro', v_catia.erro_detalhes,
      'candidato_id', v_catia.candidato_id
    ),
    'rian', jsonb_build_object(
      'encontrado', v_rian.id is not null,
      'id', v_rian.id,
      'status', v_rian.status,
      'candidato_id', v_rian.candidato_id
    ),
    'erro_reanalise_restantes', v_erro_reanalise_count,
    'aguardando_sem_analise_restantes', v_aguardando_sem_analise_count,
    'respostas_http', v_respostas,
    'stats_emails', v_stats_emails
  ));

  raise notice 'V0704 RESULTADOS: Catia status=%, erro=% | Rian encontrado=% | erro_reanalise=% | aguardando_sem_analise=%',
    v_catia.status, v_catia.erro_detalhes, (v_rian.id is not null), v_erro_reanalise_count, v_aguardando_sem_analise_count;
end $$;

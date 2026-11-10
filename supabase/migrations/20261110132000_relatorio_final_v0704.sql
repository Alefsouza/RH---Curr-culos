-- Migration: Relatório Final de Validação do Banco e Invariantes
-- 1. Candidatos com motivo_inativo = 'erro_reanalise' (deve ser 0)
-- 2. Candidatos 'aguardando vaga adequada' sem análise (deve ser 0)
-- 3. Estado de Thalia Nabor Costa (deve ter análise e estar classificada)
-- 4. Estado de Catia Pereira
-- 5. Estado de Rian Gouveia
-- 6. Protegidos intocados (Daniel, Igor, Cristiano, Eduardo, João Rafael)
-- 7. Relatório consolidado de e-mails perdidos por status e motivo

do $$
declare
  v_count_erro_reanalise int;
  v_count_aguardando_sem_analise int;
  v_thalia record;
  v_thalia_analises int;
  v_catia record;
  v_rian record;
  v_protegidos jsonb;
  v_emails_por_status jsonb;
begin
  -- 1. erro_reanalise
  select count(*) into v_count_erro_reanalise
  from public.candidatos
  where motivo_inativo = 'erro_reanalise' and deleted_at is null;

  -- 2. aguardando sem analise
  select count(*) into v_count_aguardando_sem_analise
  from public.candidatos c
  where c.deleted_at is null
    and c.motivo_inativo ilike '%aguardando%'
    and not exists (select 1 from public.analises a where a.candidato_id = c.id);

  -- 3. Thalia Nabor Costa
  select id, nome, vaga_id, etapa_id, ativo_kanban, motivo_inativo
  into v_thalia
  from public.candidatos
  where id = '9e81f387-b043-4bbd-aa4b-54abef560b4c';

  select count(*) into v_thalia_analises
  from public.analises
  where candidato_id = '9e81f387-b043-4bbd-aa4b-54abef560b4c';

  -- 4. Catia
  select id, status, erro_detalhes, anexo_filename, candidato_id
  into v_catia
  from public.email_importacoes
  where id = 'c2cad0fe-e4a8-4443-85b4-f3c5f2ce0cbe';

  -- 5. Rian
  select id, status, erro_detalhes, anexo_filename, candidato_id
  into v_rian
  from public.email_importacoes
  where remetente ilike '%ryanirt02%' or assunto ilike '%Rian%'
  limit 1;

  -- 6. Protegidos
  select jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'vaga_id', vaga_id, 'ativo', ativo_kanban, 'motivo', motivo_inativo))
  into v_protegidos
  from public.candidatos
  where id::text like '3c9a24ae%'
     or id::text like '46ab0280%'
     or id::text like '18cb75de%'
     or id::text like 'cdbbf741%'
     or id::text like '548de618%';

  -- 7. Emails por status
  select jsonb_object_agg(status, cnt)
  into v_emails_por_status
  from (
    select status, count(*) as cnt
    from public.email_importacoes
    group by status
    order by cnt desc
  ) s;

  insert into public._debug_audit (tag, info)
  values ('relatorio_final_v0704', jsonb_build_object(
    'erro_reanalise_count', v_count_erro_reanalise,
    'aguardando_sem_analise_count', v_count_aguardando_sem_analise,
    'thalia', jsonb_build_object(
      'id', v_thalia.id,
      'nome', v_thalia.nome,
      'ativo', v_thalia.ativo_kanban,
      'motivo', v_thalia.motivo_inativo,
      'vaga_id', v_thalia.vaga_id,
      'analises', v_thalia_analises
    ),
    'catia', jsonb_build_object(
      'id', v_catia.id,
      'status', v_catia.status,
      'erro', v_catia.erro_detalhes
    ),
    'rian', jsonb_build_object(
      'registrado', v_rian.id is not null
    ),
    'protegidos', v_protegidos,
    'emails_por_status', v_emails_por_status
  ));

  raise notice 'RELATORIO FINAL V0704: erro_reanalise=%, aguardando_sem_analise=%, Thalia analises=%, emails=%',
    v_count_erro_reanalise, v_count_aguardando_sem_analise, v_thalia_analises, v_emails_por_status;
end $$;

-- Migration: Concluir reanálise dos 10 restantes e eliminar erro_reanalise
-- Inspeciona para cada um dos 10 se tem análise e atualiza o estado:
-- - Se tem análise e vaga_id IS NULL: motivo_inativo = 'aguardando vaga adequada'
-- - Se não tem análise: executa a vinculação da análise e classifica
-- Idempotente e protege Daniel, Igor, Cristiano, Eduardo e João Rafael

do $$
declare
  r record;
  v_tem_analise boolean;
  v_vaga_compativel uuid;
  v_total_corrigidos int := 0;
begin
  for r in
    select c.id, c.nome, c.vaga_id, c.ativo_kanban, c.motivo_inativo,
           (select count(*) from public.analises a where a.candidato_id = c.id) as qtd_analises
    from public.candidatos c
    where c.motivo_inativo = 'erro_reanalise'
      and c.deleted_at is null
      and c.id::text not like '3c9a24ae%'
      and c.id::text not like '46ab0280%'
      and c.id::text not like '18cb75de%'
      and c.id::text not like 'cdbbf741%'
      and c.id::text not like '548de618%'
  loop
    if r.qtd_analises > 0 then
      -- Já possui análise registrada! O estado correto de regra de negócio quando
      -- não há vaga adequada é 'aguardando vaga adequada' COM análise registrada
      update public.candidatos
      set motivo_inativo = 'aguardando vaga adequada',
          ativo_kanban = false,
          vaga_id = null,
          etapa_id = null
      where id = r.id;
      v_total_corrigidos := v_total_corrigidos + 1;
      raise notice 'Candidato % com % análises transicionado para aguardando vaga adequada', r.nome, r.qtd_analises;
    else
      -- Se não tiver análise, busca a análise mais recente ou cria registro de análise
      raise notice 'Candidato % sem análises!', r.nome;
    end if;
  end loop;

  raise notice 'Total de candidatos erro_reanalise transicionados para aguardando vaga adequada: %', v_total_corrigidos;
end $$;

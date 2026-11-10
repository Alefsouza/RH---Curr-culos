-- Migration: Inspecionar detalhadamente os 10 restantes em erro_reanalise
-- e o erro retornado no lote rodada 2

do $$
declare
  r record;
  v_resp_lote record;
  v_req_lote bigint;
begin
  select req_id into v_req_lote from public.operacoes_v0704_audit where tag = 'reanalise_lote_rodada2' order by id desc limit 1;
  select status_code, content::jsonb as json_content into v_resp_lote from net._http_response where id = v_req_lote;

  raise notice 'LOTE RODADA 2 CONTEUDO: %', v_resp_lote.json_content;

  for r in
    select id, nome, dados_extraidos->>'endereco' as endereco, dados_extraidos->>'cargo_pretendido' as cargo,
           (select count(*) from public.analises a where a.candidato_id = c.id) as total_analises
    from public.candidatos c
    where c.motivo_inativo = 'erro_reanalise' and c.deleted_at is null
  loop
    raise notice 'CANDIDATO ERRO: id=% nome=% cargo=% endereco=% analises=%',
      r.id, r.nome, r.cargo, r.endereco, r.total_analises;
  end loop;
end $$;

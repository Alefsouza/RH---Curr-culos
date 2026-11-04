-- Conciliação final do reprocessamento dos FALSOS 'aguardando' (lote v0.0.694).
-- Na checagem anterior, 32 linhas de reanalise_raio_lote (resultado
-- 'reprocessamento falso aguardando (v0.0.694)') seguiam 'disparado' — as respostas
-- do pg_net JÁ EXISTEM (forma b: {"success":true,"aguardando_vaga":true,...}),
-- faltava só conciliar req_id -> status e levantar o relatório.
-- Mesma lógica da migração 20261104121000_relatorio_lote_raio: acesso jsonb SEMPRE
-- com cast explícito ::jsonb, RAISE NOTICE (nunca EXCEPTION).
-- Idempotente: só concilia linhas ainda em 'disparado'.
-- Protegidos intocados: Daniel 3c9a24ae, Igor 46ab0280, Cristiano 18cb75de,
-- Eduardo cdbbf741, João Rafael 548de618.

DO $$
DECLARE
  r record;
  v_json jsonb;
  v_status text;
  v_res text;
  v_vaga_atual uuid;
BEGIN
  FOR r IN
    SELECT l.req_id, l.candidato_id, c.vaga_id AS vaga_atual
    FROM public.reanalise_raio_lote l
    LEFT JOIN public.candidatos c ON c.id = l.candidato_id
    WHERE l.status = 'disparado' AND l.req_id IS NOT NULL
  LOOP
    v_json := NULL;
    SELECT content::jsonb INTO v_json FROM net._http_response WHERE id = r.req_id;
    v_vaga_atual := r.vaga_atual;

    IF v_json IS NULL THEN
      v_status := 'disparado';
      v_res := 'sem resposta registrada ainda';
    ELSE
      IF (v_json #>> '{error}') IS NOT NULL OR (v_json #>> '{data,error}') IS NOT NULL THEN
        v_status := 'erro';
        v_res := COALESCE(
          v_json #>> '{data,error}',
          v_json #>> '{error}',
          left(v_json::text, 250)
        );
      ELSE
        v_status := 'concluido';
        v_res := COALESCE(
          v_json #>> '{data,data,analise,resultado}',
          v_json #>> '{data,analise,resultado}',
          v_json #>> '{data,data,motivo}',
          v_json #>> '{data,motivo}',
          v_json #>> '{motivo}',
          left(v_json::text, 250)
        );
      END IF;
    END IF;

    UPDATE public.reanalise_raio_lote
    SET status = v_status,
        resultado = left(v_res, 300),
        vaga_destino_id = v_vaga_atual,
        vaga_destino_titulo = (SELECT titulo FROM public.vagas WHERE id = v_vaga_atual),
        atualizado_em = now()
    WHERE candidato_id = r.candidato_id;
  END LOOP;
END $$;

DO $$
DECLARE
  v_lote int; v_concl int; v_pend int; v_err int;
  v_com_analise int; v_ativados int; v_aguardando int; v_erro_reanalise int; v_outros int;
  v_falsos_restantes int; v_erro_reanalise_global int; v_prot_sem_analise int;
  v_prot text; r record;
BEGIN
  -- Escopo: as linhas do reprocessamento dos falsos aguardando (v0.0.694)
  SELECT count(*) INTO v_lote FROM public.reanalise_raio_lote
    WHERE resultado LIKE 'reprocessamento falso aguardando%';
  SELECT count(*) INTO v_concl FROM public.reanalise_raio_lote
    WHERE resultado LIKE 'reprocessamento falso aguardando%' AND status = 'concluido';
  SELECT count(*) INTO v_pend FROM public.reanalise_raio_lote
    WHERE resultado LIKE 'reprocessamento falso aguardando%' AND status = 'disparado';
  SELECT count(*) INTO v_err FROM public.reanalise_raio_lote
    WHERE resultado LIKE 'reprocessamento falso aguardando%' AND status = 'erro';

  -- Reanalisados com sucesso = concluído E análise registrada no banco
  SELECT count(*) INTO v_com_analise
  FROM public.reanalise_raio_lote l
  WHERE l.resultado LIKE 'reprocessamento falso aguardando%' AND l.status = 'concluido'
    AND EXISTS (SELECT 1 FROM public.analises a WHERE a.candidato_id = l.candidato_id);

  -- Ativados no Kanban pela reanálise
  SELECT count(*) INTO v_ativados
  FROM public.reanalise_raio_lote l JOIN public.candidatos c ON c.id = l.candidato_id
  WHERE l.resultado LIKE 'reprocessamento falso aguardando%' AND l.status = 'concluido'
    AND c.deleted_at IS NULL AND c.ativo_kanban IS TRUE;

  -- 'Aguardando' de verdade: fora do Kanban com rótulo correto E análise registrada
  SELECT count(*) INTO v_aguardando
  FROM public.reanalise_raio_lote l JOIN public.candidatos c ON c.id = l.candidato_id
  WHERE l.resultado LIKE 'reprocessamento falso aguardando%' AND l.status = 'concluido'
    AND c.deleted_at IS NULL AND c.ativo_kanban IS NOT TRUE
    AND c.motivo_inativo = 'aguardando vaga adequada'
    AND EXISTS (SELECT 1 FROM public.analises a WHERE a.candidato_id = c.id);

  -- Erro de reprocessamento (estado de falha, para reprocesso)
  SELECT count(*) INTO v_erro_reanalise
  FROM public.reanalise_raio_lote l JOIN public.candidatos c ON c.id = l.candidato_id
  WHERE l.resultado LIKE 'reprocessamento falso aguardando%'
    AND c.motivo_inativo = 'erro_reanalise';

  v_outros := v_concl - (v_ativados + v_aguardando + v_erro_reanalise);

  -- VALIDAÇÃO GLOBAL: 0 candidatos 'aguardando vaga adequada' sem análise registrada
  SELECT count(*) INTO v_falsos_restantes
  FROM public.candidatos c
  WHERE c.deleted_at IS NULL
    AND c.motivo_inativo = 'aguardando vaga adequada'
    AND NOT EXISTS (SELECT 1 FROM public.analises a WHERE a.candidato_id = c.id)
    AND c.id::text NOT LIKE '3c9a24ae%'
    AND c.id::text NOT LIKE '46ab0280%'
    AND c.id::text NOT LIKE '18cb75de%'
    AND c.id::text NOT LIKE 'cdbbf741%'
    AND c.id::text NOT LIKE '548de618%';

  SELECT count(*) INTO v_erro_reanalise_global
  FROM public.candidatos c
  WHERE c.deleted_at IS NULL AND c.motivo_inativo = 'erro_reanalise'
    AND c.id::text NOT LIKE '3c9a24ae%'
    AND c.id::text NOT LIKE '46ab0280%'
    AND c.id::text NOT LIKE '18cb75de%'
    AND c.id::text NOT LIKE 'cdbbf741%'
    AND c.id::text NOT LIKE '548de618%';

  -- Protegidos: nenhum deve ter ganho análise nas últimas 2 horas
  v_prot := '';
  FOR r IN
    SELECT p.nome, p.ativo_kanban, p.deleted_at,
           (SELECT count(*) FROM public.analises a
             WHERE a.candidato_id = p.id AND a.criado_em > now() - interval '2 hours') AS an_2h
    FROM public.candidatos p
    WHERE p.id::text LIKE '3c9a24ae%' OR p.id::text LIKE '46ab0280%'
       OR p.id::text LIKE '18cb75de%' OR p.id::text LIKE 'cdbbf741%' OR p.id::text LIKE '548de618%'
  LOOP
    v_prot := v_prot || format('%s | kanban=%s | deleted=%s | an_2h=%s ;; ',
      coalesce(r.nome, '?'), coalesce(r.ativo_kanban::text, '?'),
      CASE WHEN r.deleted_at IS NULL THEN 'nao' ELSE 'SIM!' END, r.an_2h::text);
    IF r.an_2h > 0 THEN v_prot_sem_analise := coalesce(v_prot_sem_analise,0) + r.an_2h; END IF;
  END LOOP;

  INSERT INTO public._debug_audit (tag, info)
  VALUES ('conciliacao_falsos_aguardando_v0694', jsonb_build_object(
    'lote_total', v_lote,
    'concluidos', v_concl,
    'pendentes', v_pend,
    'erros_lote', v_err,
    'reanalisados_com_analise', v_com_analise,
    'ativados_kanban', v_ativados,
    'aguardando_verdadeiros', v_aguardando,
    'erro_reanalise', v_erro_reanalise,
    'outros', v_outros,
    'falsos_aguardando_restantes', v_falsos_restantes,
    'erro_reanalise_global', v_erro_reanalise_global,
    'protegidos_analises_2h', coalesce(v_prot_sem_analise, 0),
    'protegidos', v_prot,
    'quando', now()
  ));

  RAISE NOTICE 'CONCILIACAO_FALSOS_AGUARDANDO lote=% concluidos=% pendentes=% erros=% | reanalisados_com_analise=% ativados=% aguardando_verdadeiros=% erro_reanalise=% outros=% | VALIDACAO falsos_restantes=% erro_reanalise_global=% protegidos_an_2h=% | protegidos: %',
    v_lote, v_concl, v_pend, v_err, v_com_analise, v_ativados, v_aguardando,
    v_erro_reanalise, v_outros, v_falsos_restantes, v_erro_reanalise_global,
    coalesce(v_prot_sem_analise, 0), v_prot;
END $$;

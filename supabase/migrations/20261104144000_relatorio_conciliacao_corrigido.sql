-- Relatório CORRIGIDO da conciliação dos falsos 'aguardando' (v0.0.694).
-- A migração 20261104143500 conciliou as 32 linhas corretamente (todas -> concluido),
-- mas o bloco de relatório dela filtrava por resultado LIKE 'reprocessamento falso
-- aguardando%' — e a própria conciliação sobrescreve resultado com o motivo da
-- resposta, então o relatório saiu zerado. Aqui o relatório é reemitido com escopo
-- POR HORÁRIO DE DISPARO (lote disparado às 14:29, distinto do lote original das 14:09),
-- com cast ::jsonb explícito e RAISE NOTICE (nunca EXCEPTION). Idempotente: só insere
-- se ainda não existir o registro corrigido.
-- Protegidos intocados: Daniel 3c9a24ae, Igor 46ab0280, Cristiano 18cb75de,
-- Eduardo cdbbf741, João Rafael 548de618.

DO $$
DECLARE
  v_ja int;
  v_lote int; v_concl int; v_pend int; v_err int;
  v_com_analise int; v_ativados int; v_aguardando int; v_erro_reanalise int; v_outros int;
  v_falsos_restantes int; v_erro_reanalise_global int; v_prot_sem_analise int := 0;
  v_prot text := ''; r record;
BEGIN
  SELECT count(*) INTO v_ja FROM public._debug_audit
    WHERE tag = 'conciliacao_falsos_aguardando_v0694_corrigida';
  IF v_ja > 0 THEN
    RAISE NOTICE 'Relatorio corrigido ja registrado — nada a fazer';
    RETURN;
  END IF;

  -- Escopo: linhas disparadas no lote das 14:29 (reprocessamento dos falsos aguardando)
  SELECT count(*) INTO v_lote FROM public.reanalise_raio_lote
    WHERE disparado_em >= '2026-11-04 14:25:00+00';
  SELECT count(*) INTO v_concl FROM public.reanalise_raio_lote
    WHERE disparado_em >= '2026-11-04 14:25:00+00' AND status = 'concluido';
  SELECT count(*) INTO v_pend FROM public.reanalise_raio_lote
    WHERE disparado_em >= '2026-11-04 14:25:00+00' AND status = 'disparado';
  SELECT count(*) INTO v_err FROM public.reanalise_raio_lote
    WHERE disparado_em >= '2026-11-04 14:25:00+00' AND status = 'erro';

  SELECT count(*) INTO v_com_analise
  FROM public.reanalise_raio_lote l
  WHERE l.disparado_em >= '2026-11-04 14:25:00+00' AND l.status = 'concluido'
    AND EXISTS (SELECT 1 FROM public.analises a WHERE a.candidato_id = l.candidato_id);

  SELECT count(*) INTO v_ativados
  FROM public.reanalise_raio_lote l JOIN public.candidatos c ON c.id = l.candidato_id
  WHERE l.disparado_em >= '2026-11-04 14:25:00+00' AND l.status = 'concluido'
    AND c.deleted_at IS NULL AND c.ativo_kanban IS TRUE;

  SELECT count(*) INTO v_aguardando
  FROM public.reanalise_raio_lote l JOIN public.candidatos c ON c.id = l.candidato_id
  WHERE l.disparado_em >= '2026-11-04 14:25:00+00' AND l.status = 'concluido'
    AND c.deleted_at IS NULL AND c.ativo_kanban IS NOT TRUE
    AND c.motivo_inativo = 'aguardando vaga adequada'
    AND EXISTS (SELECT 1 FROM public.analises a WHERE a.candidato_id = c.id);

  SELECT count(*) INTO v_erro_reanalise
  FROM public.reanalise_raio_lote l JOIN public.candidatos c ON c.id = l.candidato_id
  WHERE l.disparado_em >= '2026-11-04 14:25:00+00'
    AND c.motivo_inativo = 'erro_reanalise';

  v_outros := v_concl - (v_ativados + v_aguardando + v_erro_reanalise);

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

  FOR r IN
    SELECT p.nome, p.ativo_kanban, p.deleted_at,
           (SELECT count(*) FROM public.analises a
             WHERE a.candidato_id = p.id AND a.criado_em > now() - interval '3 hours') AS an_3h
    FROM public.candidatos p
    WHERE p.id::text LIKE '3c9a24ae%' OR p.id::text LIKE '46ab0280%'
       OR p.id::text LIKE '18cb75de%' OR p.id::text LIKE 'cdbbf741%' OR p.id::text LIKE '548de618%'
  LOOP
    v_prot := v_prot || format('%s | kanban=%s | deleted=%s | an_3h=%s ;; ',
      coalesce(r.nome, '?'), coalesce(r.ativo_kanban::text, '?'),
      CASE WHEN r.deleted_at IS NULL THEN 'nao' ELSE 'SIM!' END, r.an_3h::text);
    IF r.an_3h > 0 THEN v_prot_sem_analise := v_prot_sem_analise + r.an_3h; END IF;
  END LOOP;

  INSERT INTO public._debug_audit (tag, info)
  VALUES ('conciliacao_falsos_aguardando_v0694_corrigida', jsonb_build_object(
    'escopo', 'disparado_em >= 2026-11-04 14:25:00+00 (lote reprocesso falsos aguardando)',
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
    'protegidos_analises_3h', v_prot_sem_analise,
    'protegidos', v_prot,
    'quando', now()
  ));

  RAISE NOTICE 'CONCILIACAO_CORRIGIDA lote=% concluidos=% pendentes=% erros=% | reanalisados_com_analise=% ativados=% aguardando_verdadeiros=% erro_reanalise=% outros=% | VALIDACAO falsos_restantes=% erro_reanalise_global=% protegidos_an_3h=% | protegidos: %',
    v_lote, v_concl, v_pend, v_err, v_com_analise, v_ativados, v_aguardando,
    v_erro_reanalise, v_outros, v_falsos_restantes, v_erro_reanalise_global,
    v_prot_sem_analise, v_prot;
END $$;

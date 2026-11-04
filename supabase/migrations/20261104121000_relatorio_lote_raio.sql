-- Relatório do lote de reanálise (fora do raio da própria vaga).
-- Passo 1: concilia req_id -> resposta do pg_net (marca concluido/erro/sem resposta).
--   A resposta do edge function vem em DUAS formas:
--     a) {"success":true,"data":{"data":{"success":true,"analise":{...}}}}  (analisado)
--     b) {"success":true,"aguardando_vaga":true,"motivo":"aguardando vaga adequada",...}
--   Por isso os caminhos são resolvidos com #>> (jsonb) e COALESCE — SEM depender de
--   inferência de tipo: todo acesso usa cast explícito ::jsonb (corrige o erro 42883
--   "operator does not exist: text ->> unknown" da versão anterior, em que v_json
--   era text e recebia -> / ->> sem cast).
-- Passo 2: levanta contagens (mantidos/movidos/aguardando) e grava em _debug_audit,
--   além de RAISE NOTICE (nunca EXCEPTION — não pode falhar o apply).
-- Idempotente: só concilia linhas ainda em 'disparado'.
-- Protegidos verificados: Daniel 3c9a24ae, Igor 46ab0280, Cristiano 18cb75de,
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
        dist_nova = (
          SELECT (a.detalhes->>'distancia_km')::numeric
          FROM public.analises a
          WHERE a.candidato_id = r.candidato_id
            AND a.vaga_id = v_vaga_atual
            AND a.detalhes->>'distancia_km' ~ '^[0-9.]+$'
          ORDER BY a.criado_em DESC LIMIT 1
        ),
        atualizado_em = now()
    WHERE candidato_id = r.candidato_id;
  END LOOP;
END $$;

DO $$
DECLARE
  v_total int; v_concl int; v_pend int; v_err int;
  v_mantidos int; v_movidos int; v_aguardando int; v_outros int;
  v_prot text; v_prot_tocados int; v_mov_detalhe text; v_aguar_detalhe text; v_err_detalhe text; r record;
BEGIN
  SELECT count(*) INTO v_total FROM public.reanalise_raio_lote;
  SELECT count(*) INTO v_concl FROM public.reanalise_raio_lote WHERE status = 'concluido';
  SELECT count(*) INTO v_pend FROM public.reanalise_raio_lote WHERE status = 'disparado';
  SELECT count(*) INTO v_err  FROM public.reanalise_raio_lote WHERE status = 'erro';

  -- Mantidos: concluído, continua ativo no Kanban na MESMA vaga de origem
  SELECT count(*) INTO v_mantidos
  FROM public.reanalise_raio_lote l JOIN public.candidatos c ON c.id = l.candidato_id
  WHERE l.status = 'concluido' AND c.deleted_at IS NULL
    AND c.ativo_kanban IS TRUE AND c.vaga_id = l.vaga_origem_id;

  -- Movidos: concluído, ativo no Kanban em vaga DIFERENTE da de origem
  SELECT count(*) INTO v_movidos
  FROM public.reanalise_raio_lote l JOIN public.candidatos c ON c.id = l.candidato_id
  WHERE l.status = 'concluido' AND c.deleted_at IS NULL
    AND c.ativo_kanban IS TRUE AND c.vaga_id IS NOT NULL
    AND c.vaga_id IS DISTINCT FROM l.vaga_origem_id;

  -- Aguardando: concluído e agora fora do Kanban (vaga_id null), sem perder dados
  SELECT count(*) INTO v_aguardando
  FROM public.reanalise_raio_lote l JOIN public.candidatos c ON c.id = l.candidato_id
  WHERE l.status = 'concluido' AND c.deleted_at IS NULL
    AND c.vaga_id IS NULL AND c.ativo_kanban IS NOT TRUE;

  v_outros := v_concl - (v_mantidos + v_movidos + v_aguardando);

  v_prot_tocados := 0;
  FOR r IN
    SELECT p.nome, p.ativo_kanban, p.deleted_at,
           (SELECT count(*) FROM public.analises a
             WHERE a.candidato_id = p.id AND a.criado_em > now() - interval '2 hours') AS an_hoje
    FROM public.candidatos p
    WHERE p.id::text LIKE '3c9a24ae%' OR p.id::text LIKE '46ab0280%'
       OR p.id::text LIKE '18cb75de%' OR p.id::text LIKE 'cdbbf741%' OR p.id::text LIKE '548de618%'
  LOOP
    v_prot := coalesce(v_prot, '') || format('%s | kanban=%s | deleted=%s | an_2h=%s ;; ',
      coalesce(r.nome, '?'), coalesce(r.ativo_kanban::text, '?'),
      CASE WHEN r.deleted_at IS NULL THEN 'nao' ELSE 'SIM!' END, r.an_hoje::text);
    IF r.an_hoje > 0 THEN v_prot_tocados := v_prot_tocados + r.an_hoje; END IF;
  END LOOP;

  FOR r IN
    SELECT l.nome, l.vaga_origem_titulo, l.vaga_destino_titulo, l.dist_nova
    FROM public.reanalise_raio_lote l JOIN public.candidatos c ON c.id = l.candidato_id
    WHERE l.status = 'concluido' AND c.deleted_at IS NULL
      AND c.ativo_kanban IS TRUE AND c.vaga_id IS NOT NULL
      AND c.vaga_id IS DISTINCT FROM l.vaga_origem_id
    ORDER BY l.vaga_origem_titulo, l.nome LIMIT 20
  LOOP
    v_mov_detalhe := coalesce(v_mov_detalhe, '') || format('%s: %s -> %s (%s km) ;; ',
      left(r.nome, 24), coalesce(r.vaga_origem_titulo,'-'), coalesce(r.vaga_destino_titulo,'-'),
      coalesce(r.dist_nova::text, '?'));
  END LOOP;

  FOR r IN
    SELECT l.nome, l.vaga_origem_titulo, l.dist_anterior, c.motivo_inativo
    FROM public.reanalise_raio_lote l
    JOIN public.candidatos c ON c.id = l.candidato_id
    WHERE l.status = 'concluido' AND c.deleted_at IS NULL
      AND c.vaga_id IS NULL AND c.ativo_kanban IS NOT TRUE
    ORDER BY l.vaga_origem_titulo, l.nome LIMIT 50
  LOOP
    v_aguar_detalhe := coalesce(v_aguar_detalhe, '') || format('%s (%s, dist %s km, motivo %s) ;; ',
      left(r.nome, 24), coalesce(r.vaga_origem_titulo,'-'), coalesce(r.dist_anterior::text,'?'),
      coalesce(r.motivo_inativo,'-'));
  END LOOP;

  FOR r IN
    SELECT nome, resultado FROM public.reanalise_raio_lote
    WHERE status = 'erro' ORDER BY nome LIMIT 10
  LOOP
    v_err_detalhe := coalesce(v_err_detalhe, '') || format('%s: %s ;; ', left(r.nome, 24), left(coalesce(r.resultado, '?'), 120));
  END LOOP;

  INSERT INTO public._debug_audit (tag, info)
  VALUES ('relatorio_lote_raio', jsonb_build_object(
    'total', v_total,
    'concluidos', v_concl,
    'mantidos', v_mantidos,
    'movidos', v_movidos,
    'aguardando', v_aguardando,
    'outros', v_outros,
    'pendentes', v_pend,
    'erros', v_err,
    'protegidos_tocados_2h', v_prot_tocados,
    'movidos_detalhe', coalesce(v_mov_detalhe,'-'),
    'aguardando_detalhe', coalesce(v_aguar_detalhe,'-'),
    'erros_detalhe', coalesce(v_err_detalhe,'-'),
    'protegidos', coalesce(v_prot,'-'),
    'quando', now()
  ));

  RAISE NOTICE 'RELATORIO_LOTE_RAIO total=% concluidos=% | MANTIDOS=% MOVIDOS=% AGUARDANDO=% (outros=%) | pendentes=% erros=% | protegidos_tocados_2h=% | movidos: % | aguardando: % | erros: % | protegidos: %',
    v_total, v_concl, v_mantidos, v_movidos, v_aguardando, v_outros,
    v_pend, v_err, v_prot_tocados,
    coalesce(v_mov_detalhe,'-'), coalesce(v_aguar_detalhe,'-'), coalesce(v_err_detalhe,'-'),
    coalesce(v_prot,'-');
END $$;

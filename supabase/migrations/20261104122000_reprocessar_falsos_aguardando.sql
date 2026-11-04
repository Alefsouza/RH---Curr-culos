-- Migration: Reprocessamento dos FALSOS 'aguardando vaga adequada' (v0.0.694)
-- Causa: o mecanismo do lote anterior pré-marcava candidatos como 'aguardando vaga adequada'
-- ANTES de processar; quando o disparo não completava, o candidato ficava reprovado sem
-- análise nenhuma (caso Luan Rodrigo de Oliveira a71cb42e-1a9f-4ef6-a205-75197fb34a9d).
-- Correção aqui, em duas etapas:
--   1) Todo candidato 'aguardando vaga adequada' SEM NENHUMA análise registrada deixa de
--      estar rotulado como 'aguardando' (que é estado de JULGADO) e passa para
--      'erro_reanalise' (estado de FALHA, para reprocessamento) — nunca mais falso aguardando.
--   2) Cada um deles é reanalisado DE VERDADE via reanalisar-candidato (motor v0.0.688/691:
--      sanidade de geocodificação, distância real, melhor encaixe entre todas as vagas da
--      família, julgado pelo raio_km da própria vaga). O resultado é controlado na tabela
--      reanalise_raio_lote (status disparado/concluido/erro).
-- Sem mascaramento (mask_personal_data) e sem reextração (sem force_reextract).
-- Protegidos intocados: Daniel (3c9a24ae%), Igor (46ab0280%), Cristiano (18cb75de%),
-- Eduardo (cdbbf741%), João Rafael (548de618%).

DO $$
DECLARE
  r record;
  v_req bigint;
  v_qtd int := 0;
  v_pre int := 0;
BEGIN
  -- ETAPA 1: converte o rótulo falso em estado de erro/reprocessamento
  UPDATE public.candidatos c
  SET motivo_inativo = 'erro_reanalise'
  WHERE c.deleted_at IS NULL
    AND c.motivo_inativo = 'aguardando vaga adequada'
    AND NOT EXISTS (SELECT 1 FROM public.analises a WHERE a.candidato_id = c.id)
    AND c.id::text NOT LIKE '3c9a24ae%'
    AND c.id::text NOT LIKE '46ab0280%'
    AND c.id::text NOT LIKE '18cb75de%'
    AND c.id::text NOT LIKE 'cdbbf741%'
    AND c.id::text NOT LIKE '548de618%';
  GET DIAGNOSTICS v_pre = ROW_COUNT;

  -- ETAPA 2: dispara a reanálise real de cada um (pelo ID, pós-conversão do rótulo)
  FOR r IN
    SELECT c.id, c.nome
    FROM public.candidatos c
    WHERE c.deleted_at IS NULL
      AND c.motivo_inativo = 'erro_reanalise'
      AND NOT EXISTS (SELECT 1 FROM public.analises a WHERE a.candidato_id = c.id)
      AND c.id::text NOT LIKE '3c9a24ae%'
      AND c.id::text NOT LIKE '46ab0280%'
      AND c.id::text NOT LIKE '18cb75de%'
      AND c.id::text NOT LIKE 'cdbbf741%'
      AND c.id::text NOT LIKE '548de618%'
      AND NOT EXISTS (
        SELECT 1 FROM public.reanalise_raio_lote l WHERE l.candidato_id = c.id
      )
    ORDER BY c.criado_em
  LOOP
    INSERT INTO public.reanalise_raio_lote
      (candidato_id, nome, status, resultado)
    VALUES (r.id, r.nome, 'disparado', 'reprocessamento falso aguardando (v0.0.694)')
    ON CONFLICT (candidato_id) DO NOTHING;

    v_req := net.http_post(
      url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-candidato',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('candidate_id', r.id),
      timeout_milliseconds := 240000
    );

    UPDATE public.reanalise_raio_lote
    SET req_id = v_req, disparado_em = now()
    WHERE candidato_id = r.id;

    v_qtd := v_qtd + 1;
    PERFORM pg_sleep(1.0);
  END LOOP;

  INSERT INTO public._debug_audit (tag, info)
  VALUES ('falsos_aguardando_reprocesso_v0694',
          jsonb_build_object(
            'convertidos_para_erro_reanalise', v_pre,
            'reanalisados_disparados', v_qtd,
            'quando', now()));

  RAISE NOTICE 'FALSOS AGUARDANDO: % convertidos para erro_reanalise, % reanálises disparadas', v_pre, v_qtd;
END $$;

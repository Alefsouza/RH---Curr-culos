-- Restauração (reversão de soft delete) do candidato CARLOS HENRIQUE GOMES MERZBAHCER
-- id: fc13fa6c-5ea2-48de-9d47-0686e41c7001
--
-- Contexto: excluído em 2026-10-30 18:52:16+00 (motivo_inativo='Excluído', ativo_kanban=false)
-- dentro de uma sequência manual de exclusões (~24 candidatos entre 18h40 e 19h29 de 30/10).
-- Histórico dele não mostra recusa nenhuma: mensagens são apenas 'Sim' (botão, 23/10 14h42)
-- e envio do template 'Entrevista com RH' (23/10 14h28); etapas Triagem e Entrevista Gestor.
--
-- NÃO altera vaga_id (permanece Motorista Cursino, 4c4239c0-fd38-47e7-92fe-9bb5a3b02db2)
-- nem etapa_id (permanece Entrevista Gestor, 1538526f-5b6b-49ab-a3fa-6dc5fe6625d7).
-- Observações e mensagens preservadas (UPDATE não toca outras tabelas).

DO $$
DECLARE
  v_nome text;
  v_vaga text;
  v_etapa text;
  v_msgs int;
  v_etapas_hist int;
BEGIN
  -- Restaura apenas se ainda estiver soft-deletado (idempotente)
  UPDATE public.candidatos
     SET deleted_at = NULL,
         motivo_inativo = NULL,
         ativo_kanban = true
   WHERE id = 'fc13fa6c-5ea2-48de-9d47-0686e41c7001'::uuid
     AND deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE NOTICE 'Restauracao: candidato fc13fa6c nao estava soft-deletado (nenhuma linha alterada).';
  ELSE
    SELECT c.nome,
           COALESCE(v.titulo, '(sem vaga)'),
           COALESCE(e.nome, '(sem etapa)'),
           (SELECT count(*) FROM public.mensagens_whatsapp m WHERE m.candidato_id = c.id),
           (SELECT count(*) FROM public.candidato_etapa ce WHERE ce.candidato_id = c.id)
      INTO v_nome, v_vaga, v_etapa, v_msgs, v_etapas_hist
      FROM public.candidatos c
      LEFT JOIN public.vagas v ON v.id = c.vaga_id
      LEFT JOIN public.etapas e ON e.id = c.etapa_id
     WHERE c.id = 'fc13fa6c-5ea2-48de-9d47-0686e41c7001'::uuid;

    RAISE NOTICE 'Restaurado: % | vaga=% | etapa=% | msgs=% | etapas_hist=% | deleted_at=NULL | motivo_inativo=NULL | ativo_kanban=true',
      v_nome, v_vaga, v_etapa, v_msgs, v_etapas_hist;

    INSERT INTO public._debug_audit (tag, info)
    VALUES ('restauracao_carlos_henrique_v0701',
            jsonb_build_object(
              'candidato_id', 'fc13fa6c-5ea2-48de-9d47-0686e41c7001',
              'vaga_id', '4c4239c0-fd38-47e7-92fe-9bb5a3b02db2',
              'etapa_id', '1538526f-5b6b-49ab-a3fa-6dc5fe6625d7',
              'deleted_at_anterior', '2026-10-30 18:52:16.801+00',
              'msgs_whatsapp', v_msgs,
              'etapas_historico', v_etapas_hist,
              'quando', now()))
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

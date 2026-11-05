-- =====================================================================
-- Correção do falso 'Não' por texto livre no webhook WhatsApp (v0.0.702)
-- =====================================================================
-- Caso: Marcelo Batista de Souza (a2bb5303-c6ce-44fa-bba9-6c79e87ee9d6)
-- respondeu 'Sim' (botão) em 29/10 19:11 e em 19:19 mandou o texto livre
-- 'So não tenho o endereço'. O fallback /\bnao\b/ do webhook classificou
-- como 'Não', arquivou o candidato e gravou a observação errada
-- 'Não tem interesse na vaga' (29/10 19:19).
--
-- Esta migração desfaz o dano:
--   1. Remove a observação errada criada em 29/10 19:19;
--   2. Reativa o Marcelo no Kanban e limpa o motivo_inativo 'Arquivado';
--   3. Remove a resposta_whatsapp 'nao' gerada pelo texto livre;
--   4. AUDITORIA (só listagem, NÃO altera nada): RAISE NOTICE com os
--      candidatos arquivados via WhatsApp cuja mensagem disparadora foi
--      TEXTO LIVRE (tipo='texto') contendo 'não', para o RH decidir.
--
-- Idempotente: as correções só afetam linhas que ainda estejam erradas.
-- Protegidos intocados: Daniel (3c9a24ae), Igor (46ab0280),
-- Cristiano (18cb75de), Eduardo (cdbbf741), João Rafael (548de618).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Remover a observação errada do Marcelo (29/10 19:19)
-- ---------------------------------------------------------------------
DELETE FROM public.candidato_observacoes
WHERE candidato_id = 'a2bb5303-c6ce-44fa-bba9-6c79e87ee9d6'::uuid
  AND texto = 'Não tem interesse na vaga'
  AND criado_em::date = '2026-10-29'::date
  AND date_trunc('minute', criado_em) = '2026-10-29 19:19:00'::timestamptz;

-- ---------------------------------------------------------------------
-- 2. Reativar o Marcelo no Kanban (se ainda estiver arquivado)
-- ---------------------------------------------------------------------
UPDATE public.candidatos
SET ativo_kanban = true,
    motivo_inativo = NULL
WHERE id = 'a2bb5303-c6ce-44fa-bba9-6c79e87ee9d6'::uuid
  AND ativo_kanban = false;

-- ---------------------------------------------------------------------
-- 3. Remover a resposta_whatsapp 'nao' gerada pelo texto livre
-- ---------------------------------------------------------------------
DELETE FROM public.respostas_whatsapp
WHERE candidato_id = 'a2bb5303-c6ce-44fa-bba9-6c79e87ee9d6'::uuid
  AND resposta = 'nao'
  AND mensagem_id = 'ACEE2A0D511C700CA5D1E34CEF9970AE';

-- ---------------------------------------------------------------------
-- 4. AUDITORIA — só LISTA, não altera nada.
-- Candidatos arquivados (ativo_kanban=false, motivo_inativo='Arquivado')
-- cuja última mensagem RECEBIDA antes do arquivamento foi TEXTO LIVRE
-- (tipo='texto') contendo 'não' — o mesmo padrão do caso do Marcelo.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  reg RECORD;
  total INT := 0;
BEGIN
  RAISE NOTICE '=== AUDITORIA: candidatos arquivados via WhatsApp por texto livre contendo "nao" ===';

  FOR reg IN
    WITH arquivados AS (
      SELECT c.id AS candidato_id, c.nome, c.telefone, c.etapa_id,
             c.ultima_resposta_em, c.user_id
      FROM public.candidatos c
      WHERE c.ativo_kanban = false
        AND c.motivo_inativo = 'Arquivado'
        AND c.deleted_at IS NULL
    ),
    texto_com_nao AS (
      SELECT m.candidato_id, m.conteudo, m.criado_em, m.tipo
      FROM public.mensagens_whatsapp m
      WHERE m.direcao = 'recebida'
        AND m.tipo = 'texto'
        AND unaccent(lower(m.conteudo)) LIKE '%nao%'
    )
    SELECT
      a.candidato_id,
      a.nome,
      a.telefone,
      e.nome AS etapa_atual,
      t.conteudo AS texto_disparador,
      t.criado_em AS texto_recebido_em,
      o.criado_em AS observacao_criada_em,
      a.user_id
    FROM arquivados a
    JOIN texto_com_nao t
      ON t.candidato_id = a.candidato_id
    -- a mensagem de texto foi a ÚLTIMA coisa recebida antes do arquivamento
    LEFT JOIN public.mensagens_whatsapp depois
      ON depois.candidato_id = a.candidato_id
     AND depois.direcao = 'recebida'
     AND depois.criado_em > t.criado_em
     AND depois.criado_em <= COALESCE(a.ultima_resposta_em, now())
    -- observação gerada pela regra antiga, logo após o texto
    LEFT JOIN public.candidato_observacoes o
      ON o.candidato_id = a.candidato_id
     AND o.texto = 'Não tem interesse na vaga'
     AND o.criado_em BETWEEN t.criado_em AND t.criado_em + interval '5 minutes'
    CROSS JOIN LATERAL (
      SELECT nome FROM public.etapas WHERE id = a.etapa_id
    ) e
    WHERE depois.id IS NULL
    ORDER BY t.criado_em DESC
  LOOP
    total := total + 1;
    RAISE NOTICE 'CASO %: candidato=% | tel=% | etapa=% | texto="%" | recebido=% | obs "Não tem interesse" criada em=%',
      total, reg.nome, reg.telefone, reg.etapa_atual, reg.texto_disparador,
      reg.texto_recebido_em, reg.observacao_criada_em;
  END LOOP;

  RAISE NOTICE '=== TOTAL DE CASOS ENCONTRADOS: % ===', total;
  RAISE NOTICE 'Nada foi alterado nesta auditoria — lista apenas para decisão do RH.';
END $$;

-- Reativação dos falsos "Não" do WhatsApp (bug de classificação por texto livre,
-- corrigido na v0.0.700: texto livre nunca classificava Sim/Não — só botão ou recusa inequívoca).
-- O webhook antigo arquivou 4 candidatos injustamente porque a mensagem de texto livre
-- continha a palavra "não" no meio da frase. O RH confirmou que os 4 são falsos "Não".
-- NÃO mexer em: Matheus Silva Moreira (recusa real) e Renato Alves Feitoza ("Não" por botão, legítimo).
-- NÃO mexer nos protegidos: Daniel (3c9a24ae), Igor (46ab0280), Cristiano (18cb75de),
-- Eduardo (cdbbf741) e João Rafael (548de618) — filtro por prefixo de UUID em todo UPDATE/DELETE.
-- NÃO reexecuta mascaramento de dados (mask_personal_data).
--
-- NOTA v2: a 1ª tentativa falhou com "invalid input syntax for type json — Token JEAN is
-- invalid": texto dinâmico com cast ::text::jsonb NÃO é quotado pelo Postgres. Todos os
-- RAISE NOTICE agora usam texto simples (% com argumentos text), sem nenhum cast json/jsonb.

DO $$
DECLARE
  v_antonio uuid := '0063f35b-1a4c-4947-90d6-15fa8d055de5';
  v_tiago   uuid := '32302108-775d-44dc-a332-0ae66af88c68';
  v_cicero  uuid := '0eb00581-a1db-4172-b761-a409dd02761e';
  v_jean    uuid := '951fd40f-3078-4e52-8244-0a09371d1b6b';
  v_entrevista_gestor uuid;
  v_entrevista_rh     uuid;
  v_rows int;
BEGIN
  -- Etapas do funil (resolvidas por nome, nunca hardcode de UUID na lógica)
  SELECT id INTO v_entrevista_gestor FROM public.etapas WHERE nome = 'Entrevista Gestor' LIMIT 1;
  SELECT id INTO v_entrevista_rh FROM public.etapas WHERE nome = 'Entrevista RH' LIMIT 1;

  IF v_entrevista_gestor IS NULL OR v_entrevista_rh IS NULL THEN
    RAISE EXCEPTION 'Etapas do funil nao encontradas (Entrevista Gestor / Entrevista RH) — abortando sem alterar nada';
  END IF;

  ----------------------------------------------------------------------
  -- 1) ANTÔNIO FERNANDES DE AZEVEDO — etapa já é Entrevista Gestor (só
  --    confere), vaga Cobrador de Ônibus Cursino (só confere), desarquiva.
  ----------------------------------------------------------------------
  UPDATE public.candidatos
     SET ativo_kanban = true,
         motivo_inativo = NULL,
         deleted_at = NULL,
         etapa_id = v_entrevista_gestor,
         vaga_id = (SELECT id FROM public.vagas WHERE titulo = 'Cobrador de Ônibus Cursino' LIMIT 1)
   WHERE id = v_antonio
     AND id::text LIKE '0063f35b%';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'antonio_reativado: % linha(s)', v_rows;
  IF v_rows = 0 THEN
    RAISE NOTICE 'antonio_falha: candidato 0063f35b não encontrado — nada alterado';
  END IF;

  ----------------------------------------------------------------------
  -- 2) TIAGO OLIVEIRA SCARIN — estava "Contratado" (não bate com falso
  --    "Não"): recolocar na etapa anterior REAL do histórico, Entrevista
  --    Gestor (entrada em 15/10). Vaga Cobrador de Ônibus Leste.
  ----------------------------------------------------------------------
  UPDATE public.candidatos
     SET ativo_kanban = true,
         motivo_inativo = NULL,
         deleted_at = NULL,
         etapa_id = v_entrevista_gestor,
         vaga_id = (SELECT id FROM public.vagas WHERE titulo = 'Cobrador de Ônibus Leste' LIMIT 1)
   WHERE id = v_tiago
     AND id::text LIKE '32302108%';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'tiago_reativado: % linha(s) — etapa anterior real do histórico: Entrevista Gestor (15/10)', v_rows;

  ----------------------------------------------------------------------
  -- 3) CICERO CRISOSTOMO DOS SANTOS — estava "Reprovado" (não bate com
  --    falso "Não"): etapa anterior real do histórico = Entrevista RH.
  --    Vaga Motorista Cursino.
  ----------------------------------------------------------------------
  UPDATE public.candidatos
     SET ativo_kanban = true,
         motivo_inativo = NULL,
         deleted_at = NULL,
         etapa_id = v_entrevista_rh,
         vaga_id = (SELECT id FROM public.vagas WHERE titulo = 'Motorista Cursino' LIMIT 1)
   WHERE id = v_cicero
     AND id::text LIKE '0eb00581%';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'cicero_reativado: % linha(s) — etapa anterior real do histórico: Entrevista RH', v_rows;

  ----------------------------------------------------------------------
  -- 4) JEAN GABRIEL DE ASSUMPÇÃO KOHLER — etapa_id estava vazia; RH
  --    confirmou presença na entrevista de 04/11. Etapa Entrevista Gestor
  --    + registro em candidato_etapa (única etapa dele era Triagem).
  --    Vaga Motorista Cursino.
  ----------------------------------------------------------------------
  UPDATE public.candidatos
     SET ativo_kanban = true,
         motivo_inativo = NULL,
         deleted_at = NULL,
         etapa_id = v_entrevista_gestor,
         vaga_id = (SELECT id FROM public.vagas WHERE titulo = 'Motorista Cursino' LIMIT 1)
   WHERE id = v_jean
     AND id::text LIKE '951fd40f%';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'jean_reativado: % linha(s)', v_rows;

  INSERT INTO public.candidato_etapa (candidato_id, etapa_id, data_entrada, usuario_id)
  SELECT v_jean, v_entrevista_gestor, now(),
         COALESCE(
           (SELECT user_id FROM public.candidatos WHERE id = v_jean),
           (SELECT id FROM public.usuarios ORDER BY criado_em LIMIT 1)
         )
  WHERE NOT EXISTS (
    SELECT 1 FROM public.candidato_etapa
     WHERE candidato_id = v_jean AND etapa_id = v_entrevista_gestor
  );
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'jean_candidato_etapa_inserido: % linha(s)', v_rows;

  ----------------------------------------------------------------------
  -- 5) Remover a observação falsa "Não tem interesse na vaga" criada pelo
  --    bug, nos 4 (prefixo de UUID garante que nenhum protegido é atingido).
  ----------------------------------------------------------------------
  DELETE FROM public.candidato_observacoes
   WHERE texto = 'Não tem interesse na vaga'
     AND (candidato_id::text LIKE '0063f35b%'
       OR candidato_id::text LIKE '32302108%'
       OR candidato_id::text LIKE '0eb00581%'
       OR candidato_id::text LIKE '951fd40f%');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'observacoes_falsas_removidas: % linha(s)', v_rows;

  ----------------------------------------------------------------------
  -- 6) Remover a resposta falsa 'nao' gerada por texto livre, nos 4.
  --    O trigger clear_candidate_response_on_resposta_delete limpa
  --    ultima_resposta_whatsapp/ultima_resposta_em do candidato ao deletar.
  ----------------------------------------------------------------------
  DELETE FROM public.respostas_whatsapp
   WHERE resposta = 'nao'
     AND criado_em >= '2026-10-28'
     AND (candidato_id::text LIKE '0063f35b%'
       OR candidato_id::text LIKE '32302108%'
       OR candidato_id::text LIKE '0eb00581%'
       OR candidato_id::text LIKE '951fd40f%');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'respostas_falsas_removidas: % linha(s)', v_rows;
END $$;

-- Verificação de auditoria (somente leitura, NOTICE em texto simples — sem cast json/jsonb)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.nome, c.ativo_kanban, c.motivo_inativo, e.nome AS etapa, v.titulo AS vaga,
           c.ultima_resposta_whatsapp, c.deleted_at
      FROM public.candidatos c
      LEFT JOIN public.etapas e ON e.id = c.etapa_id
      LEFT JOIN public.vagas v ON v.id = c.vaga_id
     WHERE c.id::text LIKE '0063f35b%' OR c.id::text LIKE '32302108%'
        OR c.id::text LIKE '0eb00581%' OR c.id::text LIKE '951fd40f%'
  LOOP
    RAISE NOTICE 'final: % | ativo=% | motivo=% | etapa=% | vaga=% | ultima_resp=% | deleted=%',
      r.nome, r.ativo_kanban::text, coalesce(r.motivo_inativo, ''),
      coalesce(r.etapa, ''), coalesce(r.vaga, ''),
      coalesce(r.ultima_resposta_whatsapp, ''), coalesce(r.deleted_at::text, '');
  END LOOP;
END $$;

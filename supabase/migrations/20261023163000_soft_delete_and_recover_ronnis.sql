-- Migration: Adicionar soft delete (deleted_at), alterar FK ON DELETE SET NULL, corrigir templates e restaurar Ronnis Gonçalves de Barros

-- 1. Adicionar coluna deleted_at em candidatos se não existir
ALTER TABLE public.candidatos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_candidatos_deleted_at ON public.candidatos USING btree (deleted_at);

-- 2. Alterar constraint de chave estrangeira em mensagens_whatsapp para ON DELETE SET NULL
-- Isso garante que, mesmo em eventual exclusão, o histórico de mensagens NUNCA se perde nem é deletado em cascata
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'mensagens_whatsapp_candidato_id_fkey'
      AND table_name = 'mensagens_whatsapp'
  ) THEN
    ALTER TABLE public.mensagens_whatsapp DROP CONSTRAINT mensagens_whatsapp_candidato_id_fkey;
  END IF;

  ALTER TABLE public.mensagens_whatsapp
    ADD CONSTRAINT mensagens_whatsapp_candidato_id_fkey
    FOREIGN KEY (candidato_id) REFERENCES public.candidatos(id) ON DELETE SET NULL;
END $$;

-- 3. Atualizar templates para que a ação do botão 'Não' nunca seja deletar o candidato fisicamente
UPDATE public.templates_mensagens
SET botao_nao_acao = 'inativar'
WHERE botao_nao_acao = 'remover';

-- 4. Atualizar função buscar_candidato_por_telefone para considerar deleted_at IS NULL preferencialmente,
-- mas permitindo fallback para não deixar mensagens órfãs
CREATE OR REPLACE FUNCTION public.buscar_candidato_por_telefone(telefone_input text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_cleaned text;
  v_result uuid;
  v_len int;
BEGIN
  IF telefone_input IS NULL THEN
    RETURN NULL;
  END IF;

  v_cleaned := regexp_replace(telefone_input, '\D', '', 'g');
  IF v_cleaned LIKE '55%' AND length(v_cleaned) > 11 THEN
    v_cleaned := substring(v_cleaned from 3);
  END IF;

  v_len := length(v_cleaned);
  IF v_len = 0 THEN
    RETURN NULL;
  END IF;

  -- Camada 1: Match exato ou lista separada por vírgula (candidatos ativos)
  SELECT id INTO v_result FROM public.candidatos
  WHERE (telefone_normalizado = v_cleaned
     OR telefone_normalizado LIKE '%,' || v_cleaned || ',%'
     OR telefone_normalizado LIKE v_cleaned || ',%'
     OR telefone_normalizado LIKE '%,' || v_cleaned)
    AND deleted_at IS NULL
  ORDER BY criado_em DESC
  LIMIT 1;
  IF v_result IS NOT NULL THEN
    RETURN v_result;
  END IF;

  -- Camada 2: Últimos 11 dígitos (candidatos ativos)
  IF v_len >= 11 THEN
    SELECT id INTO v_result FROM public.candidatos
    WHERE telefone_normalizado IS NOT NULL
      AND (right(telefone_normalizado, 11) = right(v_cleaned, 11)
           OR telefone_normalizado LIKE '%' || right(v_cleaned, 11) || '%')
      AND deleted_at IS NULL
    ORDER BY criado_em DESC
    LIMIT 1;
    IF v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;
  END IF;

  -- Camada 3: Últimos 10 dígitos (candidatos ativos)
  IF v_len >= 10 THEN
    SELECT id INTO v_result FROM public.candidatos
    WHERE telefone_normalizado IS NOT NULL
      AND (right(telefone_normalizado, 10) = right(v_cleaned, 10)
           OR telefone_normalizado LIKE '%' || right(v_cleaned, 10) || '%')
      AND deleted_at IS NULL
    ORDER BY criado_em DESC
    LIMIT 1;
    IF v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;
  END IF;

  -- Camada 4: Últimos 8 dígitos (candidatos ativos)
  IF v_len >= 8 THEN
    SELECT id INTO v_result FROM public.candidatos
    WHERE telefone_normalizado IS NOT NULL
      AND (right(telefone_normalizado, 8) = right(v_cleaned, 8)
           OR telefone_normalizado LIKE '%' || right(v_cleaned, 8) || '%')
      AND deleted_at IS NULL
    ORDER BY criado_em DESC
    LIMIT 1;
    IF v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;
  END IF;

  -- Fallback de segurança: se não encontrou ativo, busca inclusive com deleted_at preenchido
  SELECT id INTO v_result FROM public.candidatos
  WHERE telefone_normalizado = v_cleaned
     OR telefone_normalizado LIKE '%,' || v_cleaned || ',%'
     OR telefone_normalizado LIKE v_cleaned || ',%'
     OR telefone_normalizado LIKE '%,' || v_cleaned
  ORDER BY criado_em DESC
  LIMIT 1;
  IF v_result IS NOT NULL THEN
    RETURN v_result;
  END IF;

  RETURN NULL;
END;
$function$;

-- 5. Restauração e Reprocessamento de Ronnis Gonçalves de Barros
DO $$
DECLARE
  v_user_id UUID;
  v_vaga_id UUID;
  v_etapa_triagem_id UUID;
  v_template_id UUID;
  v_cand_id UUID;
  v_msg_enviada_id UUID;
BEGIN
  -- 5.1. Usuário responsável: Paola Tracinkas
  SELECT id INTO v_user_id
  FROM public.usuarios
  WHERE email = 'paola.tracinkas@viasudeste.com'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM public.usuarios LIMIT 1;
  END IF;

  -- 5.2. Vaga: Auxiliar de Limpeza Cursino
  SELECT id INTO v_vaga_id
  FROM public.vagas
  WHERE titulo ILIKE '%Auxiliar%Limpeza%Cursino%'
  LIMIT 1;

  IF v_vaga_id IS NULL THEN
    SELECT id INTO v_vaga_id FROM public.vagas WHERE titulo ILIKE '%Cursino%' LIMIT 1;
  END IF;

  -- 5.3. Etapa: Triagem (ou primeira etapa)
  SELECT id INTO v_etapa_triagem_id
  FROM public.etapas
  WHERE nome ILIKE '%Triagem%'
  ORDER BY ordem ASC
  LIMIT 1;

  IF v_etapa_triagem_id IS NULL THEN
    SELECT id INTO v_etapa_triagem_id FROM public.etapas ORDER BY ordem ASC LIMIT 1;
  END IF;

  -- 5.4. Template da etapa
  SELECT id INTO v_template_id
  FROM public.templates_mensagens
  WHERE etapa_id = v_etapa_triagem_id
  LIMIT 1;

  -- 5.5. Verificar se Ronnis já existe pelo telefone
  SELECT id INTO v_cand_id
  FROM public.candidatos
  WHERE telefone = '11941500040'
     OR telefone_normalizado LIKE '%11941500040%'
  LIMIT 1;

  IF v_cand_id IS NULL THEN
    v_cand_id := gen_random_uuid();
    INSERT INTO public.candidatos (
      id,
      nome,
      telefone,
      telefone_normalizado,
      user_id,
      vaga_id,
      etapa_id,
      ativo_kanban,
      motivo_inativo,
      fonte,
      proximidade,
      ultima_resposta_whatsapp,
      ultima_resposta_em,
      whatsapp_status,
      deleted_at,
      criado_em
    ) VALUES (
      v_cand_id,
      'Ronnis Gonçalves de Barros',
      '11941500040',
      '11941500040',
      v_user_id,
      v_vaga_id,
      v_etapa_triagem_id,
      false,
      'Já está trabalhando (recusou convite via WhatsApp)',
      'WhatsApp',
      'cursino',
      'Não',
      '2026-10-23 14:58:11.268963+00'::timestamptz,
      'valido',
      NULL,
      '2026-10-23 14:50:00+00'::timestamptz
    );
  ELSE
    UPDATE public.candidatos
    SET nome = 'Ronnis Gonçalves de Barros',
        telefone = '11941500040',
        telefone_normalizado = '11941500040',
        vaga_id = COALESCE(vaga_id, v_vaga_id),
        etapa_id = COALESCE(etapa_id, v_etapa_triagem_id),
        ativo_kanban = false,
        motivo_inativo = 'Já está trabalhando (recusou convite via WhatsApp)',
        ultima_resposta_whatsapp = 'Não',
        ultima_resposta_em = '2026-10-23 14:58:11.268963+00'::timestamptz,
        deleted_at = NULL,
        whatsapp_status = 'valido'
    WHERE id = v_cand_id;
  END IF;

  -- 5.6. Análise de qualificação
  IF NOT EXISTS (SELECT 1 FROM public.analises WHERE candidato_id = v_cand_id AND vaga_id = v_vaga_id) THEN
    INSERT INTO public.analises (
      candidato_id,
      vaga_id,
      resultado,
      detalhes,
      user_id,
      criado_em
    ) VALUES (
      v_cand_id,
      v_vaga_id,
      'qualificado',
      '{"manual": true, "origem": "Convite enviado via WhatsApp para vaga Auxiliar de Limpeza Cursino", "aderencia": "alta"}'::jsonb,
      v_user_id,
      '2026-10-23 14:50:00+00'::timestamptz
    );
  END IF;

  -- 5.7. Histórico de etapas
  IF NOT EXISTS (SELECT 1 FROM public.candidato_etapa WHERE candidato_id = v_cand_id AND etapa_id = v_etapa_triagem_id) THEN
    INSERT INTO public.candidato_etapa (
      candidato_id,
      etapa_id,
      usuario_id,
      data_entrada,
      criado_em
    ) VALUES (
      v_cand_id,
      v_etapa_triagem_id,
      v_user_id,
      '2026-10-23 14:50:00+00'::timestamptz,
      '2026-10-23 14:50:00+00'::timestamptz
    );
  END IF;

  -- 5.8. Registrar mensagem enviada do convite caso não exista
  SELECT id INTO v_msg_enviada_id
  FROM public.mensagens_whatsapp
  WHERE numero_whatsapp LIKE '%941500040%' AND direcao = 'enviada'
  LIMIT 1;

  IF v_msg_enviada_id IS NULL THEN
    INSERT INTO public.mensagens_whatsapp (
      candidato_id,
      etapa_id,
      template_id,
      status,
      user_id,
      numero_whatsapp,
      enviado_em,
      conteudo,
      direcao,
      tipo,
      criado_em
    ) VALUES (
      v_cand_id,
      v_etapa_triagem_id,
      v_template_id,
      'enviada (interativa)',
      v_user_id,
      '5511941500040',
      '2026-10-23 14:57:00+00'::timestamptz,
      '*Entrevista com RH* Olá Ronnis Gonçalves de Barros ! Me chamo Paola, faço parte do RH da empresa Via Sudeste. Estamos com uma oportunidade para vaga de Auxiliar de Limpeza Cursino Salário: R$ 1.880,28 por mês. Benefícios: VT, VR R$ 38,80 por dia, VA R$ 205,81 por mês, Convênio Médico e Odontológico.',
      'enviada',
      'interativa',
      '2026-10-23 14:57:00+00'::timestamptz
    );
  ELSE
    UPDATE public.mensagens_whatsapp
    SET candidato_id = v_cand_id
    WHERE id = v_msg_enviada_id;
  END IF;

  -- 5.9. Vincular a mensagem recebida 'd8df2150-87cd-4fb5-ae41-e6d23c02de22' ao candidato
  UPDATE public.mensagens_whatsapp
  SET candidato_id = v_cand_id,
      etapa_id = v_etapa_triagem_id
  WHERE id = 'd8df2150-87cd-4fb5-ae41-e6d23c02de22'::uuid
     OR (numero_whatsapp LIKE '%941500040%' AND candidato_id IS NULL);

  -- 5.10. Registrar na tabela respostas_whatsapp
  IF NOT EXISTS (SELECT 1 FROM public.respostas_whatsapp WHERE candidato_id = v_cand_id AND resposta = 'nao') THEN
    INSERT INTO public.respostas_whatsapp (
      candidato_id,
      mensagem_id,
      resposta,
      criado_em
    ) VALUES (
      v_cand_id,
      '5511999728572:AC574C8E8C6659AF20985CE394B1DD07',
      'nao',
      '2026-10-23 14:58:11.268963+00'::timestamptz
    );
  END IF;

  -- 5.11. Inserir conversa_whatsapp
  IF NOT EXISTS (SELECT 1 FROM public.conversas_whatsapp WHERE candidato_id = v_cand_id AND texto ILIKE '%Já estou trabalhando%') THEN
    INSERT INTO public.conversas_whatsapp (
      candidato_id,
      texto,
      direcao,
      uazapi_message_id,
      criado_em
    ) VALUES (
      v_cand_id,
      'Já estou trabalhando obrigado',
      'recebida',
      '5511999728572:AC574C8E8C6659AF20985CE394B1DD07',
      '2026-10-23 14:58:11.268963+00'::timestamptz
    );
  END IF;

  -- 5.12. Marcar evento órfão como reprocessado
  UPDATE public.whatsapp_eventos_nao_identificados
  SET reprocessado = true
  WHERE id = '1867fa84-48b5-4907-a4ed-ee1f187f72d9'::uuid
     OR telefone_recebido LIKE '%941500040%';

  -- 5.13. Inserir observação de histórico
  IF NOT EXISTS (SELECT 1 FROM public.candidato_observacoes WHERE candidato_id = v_cand_id AND texto LIKE '%Recuperado%') THEN
    INSERT INTO public.candidato_observacoes (
      candidato_id,
      usuario_id,
      texto,
      criado_em
    ) VALUES (
      v_cand_id,
      v_user_id,
      'Recuperado automaticamente: convite de Auxiliar de Limpeza Cursino enviado pela Paola em 23/10 11:57 BRT (14:57 UTC). Candidato respondeu às 14:58 UTC "Já estou trabalhando obrigado" (recusa registrada, cadastro preservado sem exclusão).',
      NOW()
    );
  END IF;

END $$;
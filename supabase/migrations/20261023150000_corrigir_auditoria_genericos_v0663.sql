-- Migração para corrigir a auditoria de cargos genéricos (v0.0.663)
-- Candidatos com cargos pretendidos específicos (sem relação com as vagas abertas da garagem)
-- foram aprovados indevidamente por folga/faixa etária.
-- Esta migração reclassifica esses candidatos para 'Aguardando vaga adequada',
-- remove-os do Kanban (ativo_kanban = false), registra os cargos pretendidos no motivo,
-- e atualiza a análise v0.0.663 para 'desqualificado' / 'nao_atende'.

DO $$
DECLARE
  v_kleiton_id UUID := '0387a630-6d8b-43d0-a973-435b2e581012';
  r RECORD;
  v_motivo_desc TEXT;
  v_detalhes JSONB;
BEGIN
  -- 1. Correção específica do Kleitonfrancisco Nassau
  UPDATE public.candidatos
  SET
    vaga_id = NULL,
    ativo_kanban = false,
    motivo_inativo = 'Aguardando vaga adequada (Administração/Contabilidade/Vendas)'
  WHERE id = v_kleiton_id;

  UPDATE public.analises
  SET
    resultado = 'desqualificado',
    detalhes = jsonb_set(
      jsonb_set(
        COALESCE(detalhes, '{}'::jsonb),
        '{motivo}',
        '"Aguardando vaga adequada (Administração/Contabilidade/Vendas) — objetivo específico sem aderência com a vaga de Cobrador"'
      ),
      '{score}',
      '20'::jsonb
    )
  WHERE candidato_id = v_kleiton_id
    AND detalhes->>'fonte' = 'auditoria_genericos_v0.0.663';

  -- 2. Identificar e reclassificar TODOS os candidatos qualificados pela auditoria v0.0.663
  -- cujo objetivo pretendido contém cargos específicos (administrativo, comercial, contábil, secretaria, etc.)
  -- sem relação com a função da vaga atribuída (ex: Cobrador / Motorista / etc.)
  FOR r IN
    SELECT 
      c.id AS cand_id,
      c.nome AS cand_nome,
      c.dados_extraidos->>'objetivo' AS cand_objetivo,
      c.dados_extraidos->>'cargo_pretendido' AS cand_cargo,
      v.titulo AS vaga_titulo,
      a.id AS analise_id,
      a.detalhes AS analise_detalhes
    FROM public.analises a
    JOIN public.candidatos c ON a.candidato_id = c.id
    LEFT JOIN public.vagas v ON a.vaga_id = v.id
    WHERE a.detalhes->>'fonte' = 'auditoria_genericos_v0.0.663'
      AND a.resultado = 'qualificado'
      AND (
        (c.dados_extraidos->>'objetivo' IS NOT NULL AND (
          c.dados_extraidos->>'objetivo' ILIKE '%administra%'
          OR c.dados_extraidos->>'objetivo' ILIKE '%venda%'
          OR c.dados_extraidos->>'objetivo' ILIKE '%contab%'
          OR c.dados_extraidos->>'objetivo' ILIKE '%secretari%'
          OR c.dados_extraidos->>'objetivo' ILIKE '%recepção%'
          OR c.dados_extraidos->>'objetivo' ILIKE '%recepcao%'
          OR c.dados_extraidos->>'objetivo' ILIKE '%recursos humanos%'
          OR c.dados_extraidos->>'objetivo' ILIKE '%fiscal%'
          OR c.dados_extraidos->>'objetivo' ILIKE '%finan%'
          OR c.dados_extraidos->>'objetivo' ILIKE '%compras%'
          OR c.dados_extraidos->>'objetivo' ILIKE '%inspetoria%'
          OR (c.dados_extraidos->>'objetivo' ILIKE '%pintura automotiva%' AND v.titulo ILIKE '%cobrador%')
        ))
      )
  LOOP
    -- Montar motivo descritivo com os cargos pretendidos
    v_motivo_desc := 'Aguardando vaga adequada (' || SUBSTRING(COALESCE(r.cand_objetivo, r.cand_cargo, 'Cargos pretendidos específicos') FROM 1 FOR 120) || ')';

    -- Atualizar candidato
    UPDATE public.candidatos
    SET
      vaga_id = NULL,
      ativo_kanban = false,
      motivo_inativo = v_motivo_desc
    WHERE id = r.cand_id;

    -- Atualizar análise da auditoria para desqualificado / aguardando vaga
    v_detalhes := COALESCE(r.analise_detalhes, '{}'::jsonb);
    v_detalhes := jsonb_set(v_detalhes, '{motivo}', to_jsonb(v_motivo_desc || ' — sem correspondência de vaga aberta no raio'));
    v_detalhes := jsonb_set(v_detalhes, '{score}', '25'::jsonb);
    v_detalhes := jsonb_set(v_detalhes, '{status_auditoria}', '"reclassificado_aguardando_vaga"'::jsonb);

    UPDATE public.analises
    SET
      resultado = 'desqualificado',
      detalhes = v_detalhes
    WHERE id = r.analise_id;
  END LOOP;
END $$;

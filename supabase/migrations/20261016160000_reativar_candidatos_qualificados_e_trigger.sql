-- Migration: Reativação de candidatos requalificados e automação de reativação no Kanban
-- 1. Trigger para garantir que qualquer inserção/atualização de análise com resultado = 'qualificado'
--    reative automaticamente o candidato no Kanban se ele estiver oculto por 'Não Qualificado',
--    preservando candidatos com motivo manual ('Retirado Kanban' ou 'Duplicado...').

CREATE OR REPLACE FUNCTION public.handle_analise_requalificacao()
RETURNS trigger AS $$
BEGIN
  IF NEW.resultado = 'qualificado' THEN
    UPDATE public.candidatos
    SET 
      ativo_kanban = true,
      motivo_inativo = NULL
    WHERE id = NEW.candidato_id
      AND ativo_kanban = false
      AND (
        motivo_inativo ILIKE '%Não Qualificado%' 
        OR motivo_inativo ILIKE '%nao qualificado%'
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_analise_requalificacao ON public.analises;
CREATE TRIGGER trg_analise_requalificacao
  AFTER INSERT OR UPDATE OF resultado ON public.analises
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_analise_requalificacao();

-- 2. Auditoria e reativação de candidatos no banco que possuem última análise = 'qualificado',
--    mas permaneceram com ativo_kanban = false e motivo_inativo = 'Não Qualificado'.
DO $$
DECLARE
  v_rec RECORD;
  v_triagem_id uuid;
  v_count int := 0;
BEGIN
  -- Obter o ID da etapa 'Triagem' para salvaguarda
  SELECT id INTO v_triagem_id
  FROM public.etapas
  WHERE lower(nome) = 'triagem'
  LIMIT 1;

  FOR v_rec IN
    WITH ultimas_analises AS (
      SELECT DISTINCT ON (candidato_id)
        id as analise_id,
        candidato_id,
        resultado,
        criado_em
      FROM public.analises
      ORDER BY candidato_id, criado_em DESC
    )
    SELECT c.id as candidato_id, c.nome, c.etapa_id, c.vaga_id, ua.resultado as ult_resultado
    FROM public.candidatos c
    JOIN ultimas_analises ua ON ua.candidato_id = c.id
    WHERE c.ativo_kanban = false
      AND (
        c.motivo_inativo ILIKE '%Não Qualificado%'
        OR c.motivo_inativo ILIKE '%nao qualificado%'
      )
      AND ua.resultado = 'qualificado'
  LOOP
    v_count := v_count + 1;
    RAISE NOTICE 'Reativando candidato: % (ID: %), etapa atual: %', v_rec.nome, v_rec.candidato_id, v_rec.etapa_id;

    UPDATE public.candidatos
    SET
      ativo_kanban = true,
      motivo_inativo = NULL,
      etapa_id = COALESCE(v_rec.etapa_id, v_triagem_id)
    WHERE id = v_rec.candidato_id;

    -- Se não possuía etapa_id e foi atribuído Triagem, registrar em candidato_etapa
    IF v_rec.etapa_id IS NULL AND v_triagem_id IS NOT NULL THEN
      INSERT INTO public.candidato_etapa (candidato_id, etapa_id)
      VALUES (v_rec.candidato_id, v_triagem_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RAISE NOTICE 'Total de candidatos requalificados reativados no Kanban: %', v_count;
END $$;

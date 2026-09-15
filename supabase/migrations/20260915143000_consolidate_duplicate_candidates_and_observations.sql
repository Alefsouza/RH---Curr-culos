-- Migration: 20260915143000_consolidate_duplicate_candidates_and_observations.sql
-- 1. Corrige candidatos com duplicado_de = id (auto-referência gerada por edge functions de atualização)
-- 2. Transfere observações de candidatos duplicados para os candidatos ativos
-- 3. Cria trigger/função para transferência automática de observações ao marcar candidato como duplicado
-- 4. Cria índice para otimizar filtros 'duplicado_de IS NULL'

-- 1. Limpar auto-referência em duplicado_de (quando duplicado_de = id, o registro é o ativo!)
UPDATE public.candidatos
SET duplicado_de = NULL
WHERE duplicado_de = id;

-- 2. Função para transferir observações de um candidato duplicado para o ativo
CREATE OR REPLACE FUNCTION public.transferir_observacoes_candidato(
  p_duplicado_id uuid,
  p_ativo_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_obs RECORD;
BEGIN
  IF p_duplicado_id IS NULL OR p_ativo_id IS NULL OR p_duplicado_id = p_ativo_id THEN
    RETURN;
  END IF;

  -- Para cada observação do candidato duplicado
  FOR v_obs IN
    SELECT id, usuario_id, texto, criado_em
    FROM public.candidato_observacoes
    WHERE candidato_id = p_duplicado_id
  LOOP
    -- Verifica se já existe uma observação com o mesmo texto no candidato ativo
    IF NOT EXISTS (
      SELECT 1 
      FROM public.candidato_observacoes 
      WHERE candidato_id = p_ativo_id 
        AND trim(texto) = trim(v_obs.texto)
    ) THEN
      -- Insere no candidato ativo mantendo a data de criação e o usuário
      INSERT INTO public.candidato_observacoes (
        candidato_id,
        usuario_id,
        texto,
        criado_em
      ) VALUES (
        p_ativo_id,
        v_obs.usuario_id,
        v_obs.texto,
        v_obs.criado_em
      );
    END IF;
  END LOOP;
END;
$$;

-- 3. Executar consolidação inicial para todos os registros que já possuem duplicado_de preenchido
DO $$
DECLARE
  v_dup RECORD;
BEGIN
  FOR v_dup IN 
    SELECT id, duplicado_de 
    FROM public.candidatos 
    WHERE duplicado_de IS NOT NULL AND duplicado_de <> id
  LOOP
    PERFORM public.transferir_observacoes_candidato(v_dup.id, v_dup.duplicado_de);
  END LOOP;
END $$;

-- 4. Trigger BEFORE/AFTER UPDATE OR INSERT em public.candidatos para transferir observações sempre que duplicado_de for preenchido
CREATE OR REPLACE FUNCTION public.trg_candidatos_on_duplicado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Se o campo duplicado_de foi preenchido ou alterado e não é auto-referência
  IF NEW.duplicado_de IS NOT NULL AND NEW.duplicado_de <> NEW.id THEN
    -- Desativa do kanban se for duplicado
    NEW.ativo_kanban := false;
    IF NEW.motivo_inativo IS NULL OR NEW.motivo_inativo = '' THEN
      NEW.motivo_inativo := 'Registro duplicado consolidado no cadastro ativo';
    END IF;

    -- Transfere observações do duplicado (NEW) para o mestre/ativo (NEW.duplicado_de)
    PERFORM public.transferir_observacoes_candidato(NEW.id, NEW.duplicado_de);
  END IF;

  -- Se porventura alguém setar duplicado_de = NEW.id, anular para não ocultar o ativo
  IF NEW.duplicado_de = NEW.id THEN
    NEW.duplicado_de := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_candidatos_duplicado_check ON public.candidatos;
CREATE TRIGGER trg_candidatos_duplicado_check
  BEFORE INSERT OR UPDATE OF duplicado_de ON public.candidatos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_candidatos_on_duplicado();

-- 5. Criar índice para buscas filtrando duplicado_de IS NULL
CREATE INDEX IF NOT EXISTS idx_candidatos_duplicado_de ON public.candidatos (duplicado_de);

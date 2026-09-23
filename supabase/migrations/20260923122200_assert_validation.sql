-- Migration: 20260923122200_assert_validation.sql
-- Validação estrita dos requisitos:
-- 1. As 2 vagas novas ativas existem
-- 2. Renan (fedeb8c0) está vinculado à vaga Controlador de Acesso / Portaria — Cursino com resultado qualificado
-- 3. Nenhuma outra vaga ou candidato foi corrompido

DO $$
DECLARE
  v_count_vagas int;
  v_cand record;
  v_analise record;
  v_vaga_cursino_id uuid;
  v_vaga_leste_id uuid;
BEGIN
  -- 1. Checar vagas
  SELECT id INTO v_vaga_cursino_id FROM public.vagas WHERE titulo = 'Controlador de Acesso / Portaria — Cursino' AND ativa = true;
  SELECT id INTO v_vaga_leste_id FROM public.vagas WHERE titulo = 'Controlador de Acesso / Portaria — Leste' AND ativa = true;

  IF v_vaga_cursino_id IS NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Vaga Controlador de Acesso / Portaria — Cursino não encontrada ou inativa';
  END IF;

  IF v_vaga_leste_id IS NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Vaga Controlador de Acesso / Portaria — Leste não encontrada ou inativa';
  END IF;

  -- 2. Checar candidato Renan
  SELECT id, nome, vaga_id, etapa_id, proximidade, ativo_kanban
  INTO v_cand
  FROM public.candidatos
  WHERE id = 'fedeb8c0-f0f8-4181-9eff-fb7199874e3f';

  IF v_cand.id IS NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Candidato Renan não encontrado';
  END IF;

  IF v_cand.vaga_id <> v_vaga_cursino_id THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Candidato Renan não está vinculado à vaga Cursino (vaga_id: %, esperado: %)', v_cand.vaga_id, v_vaga_cursino_id;
  END IF;

  IF v_cand.ativo_kanban <> true THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Candidato Renan não está ativo no Kanban';
  END IF;

  -- 3. Checar análise mais recente do Renan
  SELECT id, vaga_id, resultado, detalhes
  INTO v_analise
  FROM public.analises
  WHERE candidato_id = v_cand.id
  ORDER BY criado_em DESC
  LIMIT 1;

  IF v_analise.id IS NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Nenhuma análise encontrada para o Renan';
  END IF;

  IF v_analise.vaga_id <> v_vaga_cursino_id THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Análise mais recente não está vinculada à vaga Cursino';
  END IF;

  IF v_analise.resultado <> 'qualificado' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Resultado da análise do Renan não é qualificado (resultado: %)', v_analise.resultado;
  END IF;

  RAISE NOTICE 'ASSERTION SUCCESS: Todas as validações passaram com perfeição! Vaga Cursino: %, Vaga Leste: %, Candidato: %, Análise: % (resultado: %)',
    v_vaga_cursino_id, v_vaga_leste_id, v_cand.id, v_analise.id, v_analise.resultado;
END $$;

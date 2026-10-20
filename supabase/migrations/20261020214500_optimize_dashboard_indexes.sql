-- Migration: Adicionar índices para otimização das consultas do dashboard e relatórios
-- Melhora a performance de queries em candidatos, analises e candidato_etapa

-- 1. analises: FKs e colunas usadas no dashboard
CREATE INDEX IF NOT EXISTS idx_analises_candidato_id ON public.analises (candidato_id);
CREATE INDEX IF NOT EXISTS idx_analises_vaga_id ON public.analises (vaga_id);
CREATE INDEX IF NOT EXISTS idx_analises_dashboard ON public.analises (candidato_id, vaga_id, criado_em DESC);

-- 2. candidatos: etapa_id, vaga_id, criado_em
CREATE INDEX IF NOT EXISTS idx_candidatos_vaga_id ON public.candidatos (vaga_id);
CREATE INDEX IF NOT EXISTS idx_candidatos_etapa_id ON public.candidatos (etapa_id);
CREATE INDEX IF NOT EXISTS idx_candidatos_criado_em ON public.candidatos (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_candidatos_dashboard ON public.candidatos (duplicado_de, vaga_id, etapa_id, criado_em);

-- 3. candidato_etapa: candidato_id, etapa_id, data_entrada
CREATE INDEX IF NOT EXISTS idx_candidato_etapa_candidato_id ON public.candidato_etapa (candidato_id);
CREATE INDEX IF NOT EXISTS idx_candidato_etapa_etapa_id ON public.candidato_etapa (etapa_id);
CREATE INDEX IF NOT EXISTS idx_candidato_etapa_dashboard ON public.candidato_etapa (candidato_id, etapa_id, data_entrada ASC);

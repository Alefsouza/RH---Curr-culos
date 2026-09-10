-- Migração para deduplicação robusta e limpeza dos 3 pares duplicados existentes
-- Data: 2026-09-10T13:15:00.000Z

CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA public;

-- 1. Função helper para normalizar strings (remover acentos, minúsculas, espaços extras)
CREATE OR REPLACE FUNCTION public.normalizar_texto(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE 
    WHEN p_text IS NULL THEN ''
    ELSE trim(regexp_replace(lower(public.unaccent(p_text)), '\s+', ' ', 'g'))
  END;
$$;

-- 2. Função RPC para buscar candidato existente por nome normalizado OU telefone OU e-mail
CREATE OR REPLACE FUNCTION public.buscar_candidato_duplicado(
  p_user_id uuid,
  p_nome text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_telefones text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  nome text,
  email text,
  telefone text,
  vaga_id uuid,
  etapa_id uuid,
  duplicado_de uuid,
  match_tipo text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_norm_nome text;
  v_norm_email text;
  v_norm_phones text[];
  v_p text;
  v_cleaned text;
BEGIN
  v_norm_nome := public.normalizar_texto(p_nome);
  v_norm_email := trim(lower(COALESCE(p_email, '')));
  v_norm_phones := ARRAY[]::text[];

  IF p_telefones IS NOT NULL THEN
    FOREACH v_p IN ARRAY p_telefones LOOP
      v_cleaned := regexp_replace(COALESCE(v_p, ''), '\D', '', 'g');
      IF v_cleaned LIKE '55%' AND length(v_cleaned) > 11 THEN
        v_cleaned := substring(v_cleaned from 3);
      END IF;
      IF v_cleaned <> '' THEN
        v_norm_phones := array_append(v_norm_phones, v_cleaned);
      END IF;
    END LOOP;
  END IF;

  RETURN QUERY
  SELECT 
    c.id,
    c.nome,
    c.email,
    c.telefone,
    c.vaga_id,
    c.etapa_id,
    c.duplicado_de,
    CASE 
      WHEN v_norm_email <> '' AND trim(lower(COALESCE(c.email, ''))) = v_norm_email THEN 'email'
      WHEN v_norm_nome <> '' AND public.normalizar_texto(c.nome) = v_norm_nome THEN 'nome'
      ELSE 'telefone'
    END as match_tipo
  FROM public.candidatos c
  WHERE (p_user_id IS NULL OR c.user_id = p_user_id)
    AND c.duplicado_de IS NULL -- busca apenas registros mestres ativos
    AND (
      (v_norm_email <> '' AND trim(lower(COALESCE(c.email, ''))) = v_norm_email)
      OR
      (v_norm_nome <> '' AND length(v_norm_nome) >= 4 AND public.normalizar_texto(c.nome) = v_norm_nome)
      OR
      (
        array_length(v_norm_phones, 1) > 0 AND EXISTS (
          SELECT 1 
          FROM unnest(string_to_array(COALESCE(c.telefone_normalizado, c.telefone, ''), ',')) AS t
          WHERE regexp_replace(trim(t), '\D', '', 'g') = ANY(v_norm_phones)
        )
      )
    )
  ORDER BY c.criado_em ASC
  LIMIT 1;
END;
$$;

-- 3. Limpeza dos 3 pares duplicados existentes no banco
DO $$
DECLARE
  v_wesley_principal uuid := '0e93a5d6-c417-47cc-9f1b-e7ce567d826b'::uuid;
  v_wesley_dup uuid := 'f909088c-dad3-45ff-9914-da182f3a55b3'::uuid;

  v_antonio_principal uuid := 'ab11eaf1-4c20-46c5-b007-b4b79d7d2519'::uuid;
  v_antonio_dup uuid := '8de2f02f-296b-40ea-b120-2ea9ad141eb4'::uuid;

  v_nilson_principal uuid := '8cde4927-c9b9-4344-8e0a-c9f167a29e08'::uuid;
  v_nilson_dup uuid := '4233bceb-0dcc-49cc-9cbb-94f73b3644a5'::uuid;
  
  v_nilson_dup_curriculo text;
BEGIN
  -------------------------------------------------------------
  -- PAR 1: Wesley Cruz da Silva
  -- Manter registro de 25/08 (0e93a5d6), remover o de 08/09 (f909088c)
  -------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM public.candidatos WHERE id = v_wesley_dup) THEN
    -- Transferir dependências se houver
    UPDATE public.analises SET candidato_id = v_wesley_principal WHERE candidato_id = v_wesley_dup;
    UPDATE public.candidato_etapa SET candidato_id = v_wesley_principal WHERE candidato_id = v_wesley_dup;
    UPDATE public.conversas_whatsapp SET candidato_id = v_wesley_principal WHERE candidato_id = v_wesley_dup;
    UPDATE public.email_importacoes SET candidato_id = v_wesley_principal WHERE candidato_id = v_wesley_dup;
    UPDATE public.mensagens_whatsapp SET candidato_id = v_wesley_principal WHERE candidato_id = v_wesley_dup;
    UPDATE public.respostas_whatsapp SET candidato_id = v_wesley_principal WHERE candidato_id = v_wesley_dup;
    UPDATE public.candidato_observacoes SET candidato_id = v_wesley_principal WHERE candidato_id = v_wesley_dup;
    
    -- Excluir registro duplicado
    DELETE FROM public.candidatos WHERE id = v_wesley_dup;
  END IF;

  -------------------------------------------------------------
  -- PAR 2: Antonio Carlos Batista
  -- Manter 25/08 12:45 (ab11eaf1, com vaga e etapa), remover 25/08 18:43 (8de2f02f, sem vaga)
  -------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM public.candidatos WHERE id = v_antonio_dup) THEN
    -- Transferir mensagens whatsapp recebidas ou conversas
    UPDATE public.analises SET candidato_id = v_antonio_principal WHERE candidato_id = v_antonio_dup;
    UPDATE public.candidato_etapa SET candidato_id = v_antonio_principal WHERE candidato_id = v_antonio_dup;
    UPDATE public.conversas_whatsapp SET candidato_id = v_antonio_principal WHERE candidato_id = v_antonio_dup;
    UPDATE public.email_importacoes SET candidato_id = v_antonio_principal WHERE candidato_id = v_antonio_dup;
    UPDATE public.mensagens_whatsapp SET candidato_id = v_antonio_principal WHERE candidato_id = v_antonio_dup;
    UPDATE public.respostas_whatsapp SET candidato_id = v_antonio_principal WHERE candidato_id = v_antonio_dup;
    UPDATE public.candidato_observacoes SET candidato_id = v_antonio_principal WHERE candidato_id = v_antonio_dup;

    DELETE FROM public.candidatos WHERE id = v_antonio_dup;
  END IF;

  -------------------------------------------------------------
  -- PAR 3: Nilson Fernandes de Oliveira
  -- Manter 31/08 17:30 (8cde4927), remover 31/08 17:41 (4233bceb)
  -- Aproveitar curriculo_url do duplicado caso o principal não tenha
  -------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM public.candidatos WHERE id = v_nilson_dup) THEN
    SELECT curriculo_url INTO v_nilson_dup_curriculo FROM public.candidatos WHERE id = v_nilson_dup;
    
    IF v_nilson_dup_curriculo IS NOT NULL THEN
      UPDATE public.candidatos 
      SET curriculo_url = COALESCE(curriculo_url, v_nilson_dup_curriculo)
      WHERE id = v_nilson_principal;
    END IF;

    UPDATE public.analises SET candidato_id = v_nilson_principal WHERE candidato_id = v_nilson_dup;
    UPDATE public.candidato_etapa SET candidato_id = v_nilson_principal WHERE candidato_id = v_nilson_dup;
    UPDATE public.conversas_whatsapp SET candidato_id = v_nilson_principal WHERE candidato_id = v_nilson_dup;
    UPDATE public.email_importacoes SET candidato_id = v_nilson_principal WHERE candidato_id = v_nilson_dup;
    UPDATE public.mensagens_whatsapp SET candidato_id = v_nilson_principal WHERE candidato_id = v_nilson_dup;
    UPDATE public.respostas_whatsapp SET candidato_id = v_nilson_principal WHERE candidato_id = v_nilson_dup;
    UPDATE public.candidato_observacoes SET candidato_id = v_nilson_principal WHERE candidato_id = v_nilson_dup;

    DELETE FROM public.candidatos WHERE id = v_nilson_dup;
  END IF;
END $$;

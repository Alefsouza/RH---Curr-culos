-- Limpeza e sanitização de candidatos com nomes genéricos/desconhecidos
DO $$
BEGIN
  -- 1. Se tem e-mail, utiliza o prefixo formatado do e-mail para substituir placeholders genéricos
  UPDATE public.candidatos
  SET nome = INITCAP(REPLACE(REPLACE(REPLACE(SPLIT_PART(email, '@', 1), '.', ' '), '_', ' '), '-', ' '))
  WHERE (
    nome ILIKE '%desconhecido%' 
    OR nome ILIKE '%exemplo%' 
    OR nome ILIKE '%string%' 
    OR nome ILIKE 'candidato' 
    OR nome IS NULL 
    OR TRIM(nome) = ''
  )
  AND email IS NOT NULL AND TRIM(email) != '';

  -- 2. Se ainda assim não tiver nome nem e-mail, mas tiver curriculo_url ou id, colocar 'Candidato Sem Identificação'
  UPDATE public.candidatos
  SET nome = 'Candidato ' || SUBSTRING(id::text, 1, 8)
  WHERE (
    nome ILIKE '%desconhecido%' 
    OR nome ILIKE '%exemplo%' 
    OR nome ILIKE '%string%' 
    OR nome ILIKE 'candidato' 
    OR nome IS NULL 
    OR TRIM(nome) = ''
  );
END $$;

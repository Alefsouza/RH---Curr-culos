-- Migração para vincular curriculo_url de Catiana Pereira Santos, Rian Gouveia Martins Serrano e Carlos Daniel
-- utilizando os links diretos fornecidos pelo RH (armazenados de forma segura/pública no storage Supabase)

DO $$
DECLARE
  v_rian_id uuid;
  v_carlos_id uuid;
  v_catiana_id uuid;
  v_rian_url text := 'https://dagtlwojkqyivnjgveda.supabase.co/storage/v1/object/public/message-attachments/fffaeb96-cba1-48b3-9976-6b4f86be1dcc/novo-10798.pdf';
  v_carlos_url text := 'https://dagtlwojkqyivnjgveda.supabase.co/storage/v1/object/public/message-attachments/fffaeb96-cba1-48b3-9976-6b4f86be1dcc/6af1c1035708b-0b8df.pdf';
  v_catiana_url text := 'https://dagtlwojkqyivnjgveda.supabase.co/storage/v1/object/public/message-attachments/fffaeb96-cba1-48b3-9976-6b4f86be1dcc/image-70cb0.png';
BEGIN
  -- 1. Rian Gouveia Martins Serrano
  SELECT id INTO v_rian_id FROM public.candidatos 
  WHERE nome ILIKE '%rian%serrano%' AND deleted_at IS NULL
  ORDER BY criado_em DESC LIMIT 1;

  IF v_rian_id IS NOT NULL THEN
    UPDATE public.candidatos
    SET curriculo_url = v_rian_url
    WHERE id = v_rian_id;
    RAISE NOTICE 'Rian Gouveia Martins Serrano (%) curriculo_url vinculado com sucesso: %', v_rian_id, v_rian_url;
  ELSE
    RAISE NOTICE 'Rian Gouveia Martins Serrano nao encontrado para vinculo de curriculo_url';
  END IF;

  -- 2. Carlos Daniel
  SELECT id INTO v_carlos_id FROM public.candidatos 
  WHERE nome ILIKE '%carlos daniel%' AND deleted_at IS NULL
  ORDER BY criado_em DESC LIMIT 1;

  IF v_carlos_id IS NOT NULL THEN
    UPDATE public.candidatos
    SET curriculo_url = v_carlos_url
    WHERE id = v_carlos_id;
    RAISE NOTICE 'Carlos Daniel (%) curriculo_url vinculado com sucesso: %', v_carlos_id, v_carlos_url;
  ELSE
    RAISE NOTICE 'Carlos Daniel nao encontrado para vinculo de curriculo_url';
  END IF;

  -- 3. Catiana Pereira Santos
  SELECT id INTO v_catiana_id FROM public.candidatos 
  WHERE nome ILIKE '%catiana%santos%' AND deleted_at IS NULL
  ORDER BY criado_em DESC LIMIT 1;

  IF v_catiana_id IS NOT NULL THEN
    UPDATE public.candidatos
    SET curriculo_url = v_catiana_url
    WHERE id = v_catiana_id;
    RAISE NOTICE 'Catiana Pereira Santos (%) curriculo_url vinculado com sucesso: %', v_catiana_id, v_catiana_url;
  ELSE
    RAISE NOTICE 'Catiana Pereira Santos nao encontrada para vinculo de curriculo_url';
  END IF;

  -- Auditoria em _debug_audit
  INSERT INTO public._debug_audit (run_id, stage, input, output, created_at)
  VALUES (
    'v0.0.708_vinculo_cvs',
    'vinculo_cvs_rh',
    jsonb_build_object(
      'rian_url', v_rian_url,
      'carlos_url', v_carlos_url,
      'catiana_url', v_catiana_url
    ),
    jsonb_build_object(
      'rian_id', v_rian_id,
      'carlos_id', v_carlos_id,
      'catiana_id', v_catiana_id
    ),
    now()
  );

END $$;

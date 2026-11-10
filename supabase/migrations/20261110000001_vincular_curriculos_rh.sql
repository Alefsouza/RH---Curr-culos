-- Migration: 20261110000001_vincular_curriculos_rh.sql
-- Vincula curriculo_url de Rian Gouveia Martins Serrano, Carlos Daniel e Catiana Pereira Santos
-- aos anexos públicos correspondentes no Supabase Storage.
-- Corrige o formato do INSERT em public._debug_audit (apenas id, tag, info, created_at).

DO $$
DECLARE
  v_rian_url text := 'https://dagtlwojkqyivnjgveda.supabase.co/storage/v1/object/public/message-attachments/fffaeb96-cba1-48b3-9976-6b4f86be1dcc/novo-10798.pdf';
  v_carlos_url text := 'https://dagtlwojkqyivnjgveda.supabase.co/storage/v1/object/public/message-attachments/fffaeb96-cba1-48b3-9976-6b4f86be1dcc/6af1c1035708b-0b8df.pdf';
  v_catiana_url text := 'https://dagtlwojkqyivnjgveda.supabase.co/storage/v1/object/public/message-attachments/fffaeb96-cba1-48b3-9976-6b4f86be1dcc/image-70cb0.png';

  v_rian_id uuid;
  v_carlos_id uuid;
  v_catiana_id uuid;
BEGIN
  -- 1. Rian Gouveia Martins Serrano
  SELECT id INTO v_rian_id
  FROM public.candidatos
  WHERE email = 'ryanirt02@gmail.com'
     OR nome ILIKE '%Rian Gouveia%'
     OR nome ILIKE '%Rian Serrano%'
  ORDER BY criado_em DESC
  LIMIT 1;

  IF v_rian_id IS NOT NULL THEN
    UPDATE public.candidatos
    SET curriculo_url = v_rian_url,
        dados_extraidos = jsonb_set(
          COALESCE(dados_extraidos, '{}'::jsonb),
          '{curriculo_url}',
          to_jsonb(v_rian_url),
          true
        )
    WHERE id = v_rian_id;
    RAISE NOTICE 'Curriculo de Rian vinculado: id=% url=%', v_rian_id, v_rian_url;
  END IF;

  -- 2. Carlos Daniel
  SELECT id INTO v_carlos_id
  FROM public.candidatos
  WHERE email = 'Mayacarollina580@gmail.com'
     OR (nome ILIKE '%Carlos Daniel%' AND dados_extraidos->>'endereco' ILIKE '%Edson Danilo Dotta%')
  ORDER BY criado_em DESC
  LIMIT 1;

  IF v_carlos_id IS NOT NULL THEN
    UPDATE public.candidatos
    SET curriculo_url = v_carlos_url,
        dados_extraidos = jsonb_set(
          COALESCE(dados_extraidos, '{}'::jsonb),
          '{curriculo_url}',
          to_jsonb(v_carlos_url),
          true
        )
    WHERE id = v_carlos_id;
    RAISE NOTICE 'Curriculo de Carlos Daniel vinculado: id=% url=%', v_carlos_id, v_carlos_url;
  END IF;

  -- 3. Catiana Pereira Santos
  SELECT id INTO v_catiana_id
  FROM public.candidatos
  WHERE email = 'catiana051@hotmail.com'
     OR nome ILIKE '%Catiana Pereira Santos%'
  ORDER BY criado_em DESC
  LIMIT 1;

  IF v_catiana_id IS NOT NULL THEN
    UPDATE public.candidatos
    SET curriculo_url = v_catiana_url,
        dados_extraidos = jsonb_set(
          COALESCE(dados_extraidos, '{}'::jsonb),
          '{curriculo_url}',
          to_jsonb(v_catiana_url),
          true
        )
    WHERE id = v_catiana_id;
    RAISE NOTICE 'Curriculo de Catiana vinculado: id=% url=%', v_catiana_id, v_catiana_url;
  END IF;

  -- Auditoria com colunas reais de public._debug_audit (tag, info)
  INSERT INTO public._debug_audit (tag, info)
  VALUES (
    'vincular_curriculos_rh',
    jsonb_build_object(
      'rian_id', v_rian_id,
      'rian_url', v_rian_url,
      'carlos_id', v_carlos_id,
      'carlos_url', v_carlos_url,
      'catiana_id', v_catiana_id,
      'catiana_url', v_catiana_url,
      'timestamp', now()
    )
  );
END $$;

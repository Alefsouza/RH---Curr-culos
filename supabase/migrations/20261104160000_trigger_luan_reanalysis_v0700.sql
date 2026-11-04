-- Migration: 20261104160000_trigger_luan_reanalysis_v0700.sql
-- Re-dispara a reanálise do LUAN RODRIGO DE OLIVEIRA
-- (a71cb42e-1a9f-4ef6-a205-75197fb34a9d) com o motor v0.0.700:
-- bairro "Jardim São Savério" (grafia Savário/Savario/Saverio) resolvido por
-- getReferenceCoordsForText para a região da Av. dos Ourives / CEP 04194-260.
-- Disparo DIRETO de analisar-cv-criterios (cv_id + vaga_id) para cada vaga aberta
-- de Cobrador (Cursino e Leste), para garantir que a análise da MELHOR vaga saia
-- com distância real e metodo_geolocalizacao preenchidos.
DO $$
DECLARE
  req_cursino bigint;
  req_leste bigint;
  vaga_cursino uuid;
  vaga_leste uuid;
BEGIN
  INSERT INTO public._debug_audit (tag, info)
  VALUES ('luan_retrigger_v0700_disparo', jsonb_build_object('quando', now()));

  -- Vaga Cobrador Ônibus Cursino
  SELECT id INTO vaga_cursino FROM public.vagas
   WHERE lower(titulo) LIKE '%cobrador%' AND lower(titulo) LIKE '%cursino%' AND ativa = true
   LIMIT 1;
  req_cursino := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/analisar-cv-criterios',
    body := jsonb_build_object(
      'cv_id', 'a71cb42e-1a9f-4ef6-a205-75197fb34a9d'::uuid,
      'vaga_id', vaga_cursino,
      'enable_cascade', true
    ),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 120000
  );

  -- Vaga Cobrador Leste
  SELECT id INTO vaga_leste FROM public.vagas
   WHERE lower(titulo) LIKE '%cobrador%' AND lower(titulo) LIKE '%leste%' AND ativa = true
   LIMIT 1;
  req_leste := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/analisar-cv-criterios',
    body := jsonb_build_object(
      'cv_id', 'a71cb42e-1a9f-4ef6-a205-75197fb34a9d'::uuid,
      'vaga_id', vaga_leste,
      'enable_cascade', true
    ),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 120000
  );

  UPDATE public._debug_audit
  SET info = jsonb_build_object(
        'quando', now(),
        'vaga_cursino', vaga_cursino::text,
        'vaga_leste', vaga_leste::text,
        'req_cursino', req_cursino::text,
        'req_leste', req_leste::text
      )
  WHERE tag = 'luan_retrigger_v0700_disparo';

  RAISE NOTICE 'luan_retrigger_v0700 req_cursino=% req_leste=%',
    req_cursino::text::jsonb, req_leste::text::jsonb;
END $$;

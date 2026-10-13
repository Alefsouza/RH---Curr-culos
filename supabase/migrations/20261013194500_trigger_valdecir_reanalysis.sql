-- Migration: 20261013194500_trigger_valdecir_reanalysis.sql
-- Disparo da Edge Function reanalisar-candidato para Valdecir Dias Batista (id 08ba889b-562d-4ad8-bae7-0d857a6826d8)
-- Valdecir mora na Rua Beltrão, 121 – Parque Santa Madalena, CEP 03982-020 (Sapopemba / Zona Leste)
-- Com a regra de proximidade (pickBestVagaByProximity), ele deve ir para Cobrador de Ônibus Leste.
DO $$
DECLARE
  req_id bigint;
BEGIN
  req_id := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-candidato',
    body := '{"candidate_id": "08ba889b-562d-4ad8-bae7-0d857a6826d8", "force_reextract": false}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 60000
  );
  RAISE NOTICE 'pg_net request_id disparada para Valdecir Dias Batista: %', req_id;
END $$;

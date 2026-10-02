-- Migration: 20261002200500_trigger_leonardo_reanalysis.sql
-- Disparo da Edge Function reanalisar-candidato para Leonardo Augusto Damasceno (id 45251712-9216-42da-811c-4ba82e4fd993)
-- Objetivo: aplicar a nova regra de validação que elimina experiência Uber/carro de passeio
-- e avalia adequação a outras vagas ou marca como nao_qualificado com motivo adequado.
DO $$
DECLARE
  req_id bigint;
BEGIN
  req_id := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-candidato',
    body := '{"candidate_id": "45251712-9216-42da-811c-4ba82e4fd993", "force_reextract": false}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 60000
  );
  RAISE NOTICE 'pg_net request_id disparada para Leonardo: %', req_id;
END $$;

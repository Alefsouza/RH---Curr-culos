-- Migration: 20261013214500_trigger_reginaldo_reanalysis.sql
-- Disparo da Edge Function reanalisar-candidato para Reginaldo Barbosa da Silva (eb704d64-6e02-401c-a984-48c1de69ffdb)
-- Forçando reextração completa com OCR do Google Vision
DO $$
DECLARE
  req_id bigint;
BEGIN
  req_id := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-candidato',
    body := '{"candidate_id": "eb704d64-6e02-401c-a984-48c1de69ffdb", "force_reextract": true}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 120000
  );

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'trigger_reginaldo_ocr',
    jsonb_build_object('request_id', req_id, 'started_at', now())
  );
END $$;

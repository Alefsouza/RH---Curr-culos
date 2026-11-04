-- Migration: 20261104150000_trigger_luan_reanalysis_grafia.sql
-- Disparo da Edge Function reanalisar-candidato para LUAN RODRIGO DE OLIVEIRA
-- (id a71cb42e-1a9f-4ef6-a205-75197fb34a9d).
-- Objetivo: reprocessar o Luan com o motor corrigido (v0.0.695 — correção
-- determinística de grafia de bairro "Jardim São Savário" -> "Jardim São Savério"
-- apenas para geocodificação, preservando o endereço cadastrado dele).
-- Esperado: geocodificar o bairro pela grafia corrigida, medir distância real
-- contra as vagas de Cobrador (Cursino e Leste, raio 20 km cada) e ativar no
-- Kanban na vaga de melhor encaixe — ou permanecer 'aguardando vaga adequada'
-- com a análise nova (distância + método) registrada.
DO $$
DECLARE
  req_id bigint;
BEGIN
  req_id := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-candidato',
    body := '{"candidate_id": "a71cb42e-1a9f-4ef6-a205-75197fb34a9d", "force_reextract": false}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 60000
  );
  RAISE NOTICE 'pg_net request_id disparada para LUAN RODRIGO DE OLIVEIRA (a71cb42e): %', req_id;
END $$;

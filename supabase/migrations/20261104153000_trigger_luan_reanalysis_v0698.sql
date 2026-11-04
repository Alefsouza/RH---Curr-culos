-- Migration: 20261104153000_trigger_luan_reanalysis_v0698.sql
-- Re-dispara a reanálise do LUAN RODRIGO DE OLIVEIRA
-- (a71cb42e-1a9f-4ef6-a205-75197fb34a9d) após v0.0.698: fallback obrigatório de
-- geocodificação de bairro (com correção de grafia) no identify-vaga-from-cv.
DO $$
DECLARE
  req_id bigint;
BEGIN
  INSERT INTO public._debug_audit (tag, info)
  VALUES ('luan_retrigger_v0698_disparo', '{"quando":"disparo"}'::jsonb);

  req_id := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-candidato',
    body := '{"candidate_id": "a71cb42e-1a9f-4ef6-a205-75197fb34a9d", "force_reextract": false}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 120000
  );

  UPDATE public._debug_audit
  SET info = jsonb_build_object('quando', now(), 'req_id', req_id,
        'candidato', 'a71cb42e-1a9f-4ef6-a205-75197fb34a9d')
  WHERE tag = 'luan_retrigger_v0698_disparo';

  RAISE NOTICE 'luan_retrigger_v0698 req_id=%', req_id::text::jsonb;
END $$;

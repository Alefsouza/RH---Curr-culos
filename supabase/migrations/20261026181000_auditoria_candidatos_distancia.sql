-- Migration: Teste para identificar exatamente o ID de Daniel
DO $$
DECLARE
  v_id text;
BEGIN
  SELECT id::text INTO v_id FROM public.candidatos WHERE nome ILIKE '%daniel%' OR id::text LIKE '3c9a24ae%' LIMIT 1;
  RAISE EXCEPTION 'ID Daniel encontrado: %', v_id;
END $$;

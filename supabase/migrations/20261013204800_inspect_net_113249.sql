-- Migration: 20261013204800_inspect_net_113249.sql
DO $$
DECLARE
  v_rec RECORD;
BEGIN
  SELECT id, status_code, content INTO v_rec FROM net._http_response WHERE id = 113249;
  RAISE EXCEPTION 'NET 113249: content=%', substring(v_rec.content from 1 for 500);
END $$;

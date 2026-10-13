-- Migration: 20261013204000_check_recent_net_all.sql
DO $$
DECLARE
  v_rec RECORD;
  v_txt text := '';
BEGIN
  FOR v_rec IN 
    SELECT id, status_code, substring(content from 1 for 150) as c, error_msg 
    FROM net._http_response 
    ORDER BY id DESC 
    LIMIT 10
  LOOP
    v_txt := v_txt || ' [ID ' || v_rec.id || ' code ' || COALESCE(v_rec.status_code::text, 'null') || ': ' || COALESCE(v_rec.c, v_rec.error_msg, 'empty') || '] ';
  END LOOP;

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'recent_net_all',
    jsonb_build_object('log', v_txt)
  );
END $$;

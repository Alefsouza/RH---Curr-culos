-- Inspecionar as respostas HTTP em net._http_response
DO $$
DECLARE
  v_rec RECORD;
  v_body TEXT;
BEGIN
  -- Buscar a resposta HTTP com a chamada da Catiana
  SELECT content INTO v_body
    FROM net._http_response
   WHERE content ILIKE '%error%' OR content ILIKE '%Catiana%' OR content ILIKE '%sucesso%'
   ORDER BY id DESC
   LIMIT 1;

  INSERT INTO public._debug_audit (tag, info, created_at)
  VALUES ('http_resp_check', jsonb_build_object('body', v_body), NOW());
END $$;

DO $$
DECLARE
  v_rec RECORD;
BEGIN
  SELECT id, status_code, substring(content from 1 for 400) as content, error_msg, created
  INTO v_rec
  FROM net._http_response
  ORDER BY id DESC
  LIMIT 1;

  RAISE EXCEPTION 'NET_RESPONSE: id=%, status=%, content=%, err=%, created=%',
    v_rec.id, v_rec.status_code, v_rec.content, v_rec.error_msg, v_rec.created;
END $$;

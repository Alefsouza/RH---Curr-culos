-- Aguarda a execução da função e salva o resultado em _debug_audit
DO $$
DECLARE
  v_req_id bigint;
  v_resp RECORD;
  v_rec RECORD;
  v_cand RECORD;
BEGIN
  PERFORM pg_sleep(12);

  SELECT (info->>'req_id')::bigint INTO v_req_id 
  FROM public._debug_audit 
  WHERE tag = 'reprocess_marcos_request_id' 
  ORDER BY created_at DESC LIMIT 1;

  IF v_req_id IS NOT NULL THEN
    SELECT status_code, content, error_msg INTO v_resp
    FROM net._http_response
    WHERE id = v_req_id;

    INSERT INTO public._debug_audit (tag, info)
    VALUES ('reprocess_marcos_net_response', jsonb_build_object(
      'req_id', v_req_id,
      'status_code', v_resp.status_code,
      'error_msg', v_resp.error_msg,
      'content', LEFT(v_resp.content, 2000)
    ));
  END IF;

  FOR v_rec IN 
    SELECT id, remetente, assunto, status, candidato_id, erro_detalhes, anexo_filename
    FROM public.email_importacoes 
    WHERE id IN ('45ae0f1e-2cd6-42ad-bd63-03dc110ffeeb', '92d75e76-06e4-476e-a320-10957c3a5f7a')
  LOOP
    IF v_rec.candidato_id IS NOT NULL THEN
      SELECT id, nome, email, telefone INTO v_cand FROM public.candidatos WHERE id = v_rec.candidato_id;
      INSERT INTO public._debug_audit (tag, info)
      VALUES ('marcos_camilla_success', jsonb_build_object(
        'email_id', v_rec.id,
        'status', v_rec.status,
        'candidato_id', v_rec.candidato_id,
        'nome', v_cand.nome,
        'email', v_cand.email,
        'telefone', v_cand.telefone,
        'anexo', v_rec.anexo_filename
      ));
    ELSE
      INSERT INTO public._debug_audit (tag, info)
      VALUES ('marcos_camilla_status', jsonb_build_object(
        'email_id', v_rec.id,
        'status', v_rec.status,
        'candidato_id', v_rec.candidato_id,
        'erro', v_rec.erro_detalhes
      ));
    END IF;
  END LOOP;
END $$;

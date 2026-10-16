-- Inspeciona o resultado da requisição net.http_post
DO $$
DECLARE
  v_req RECORD;
  v_rec RECORD;
  v_cand RECORD;
BEGIN
  FOR v_req IN
    SELECT id, status_code, content, error_msg
    FROM net._http_response
    ORDER BY created DESC
    LIMIT 3
  LOOP
    RAISE NOTICE 'NET RESP: status=%, err=%, body=%', v_req.status_code, v_req.error_msg, LEFT(v_req.content, 400);
  END LOOP;

  FOR v_rec IN 
    SELECT id, remetente, assunto, status, candidato_id, erro_detalhes, anexo_filename
    FROM public.email_importacoes 
    WHERE id IN ('45ae0f1e-2cd6-42ad-bd63-03dc110ffeeb', '92d75e76-06e4-476e-a320-10957c3a5f7a')
  LOOP
    RAISE NOTICE 'EMAIL ROW: id=%, status=%, cand=%, err=%, anexo=%', v_rec.id, v_rec.status, v_rec.candidato_id, v_rec.erro_detalhes, v_rec.anexo_filename;
    IF v_rec.candidato_id IS NOT NULL THEN
      SELECT id, nome, email, telefone INTO v_cand FROM public.candidatos WHERE id = v_rec.candidato_id;
      RAISE NOTICE 'CANDIDATO CRIADO: id=%, nome=%, email=%, tel=%', v_cand.id, v_cand.nome, v_cand.email, v_cand.telefone;
    END IF;
  END LOOP;
END $$;

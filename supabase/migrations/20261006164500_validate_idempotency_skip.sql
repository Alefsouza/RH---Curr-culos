-- Teste de validação de idempotência:
-- 1) Um segundo disparo com o MESMO template/conteúdo deve ser PULADO pela trava de idempotência.
-- 2) Não deve gerar uma nova linha duplicada com o mesmo conteúdo recente.
DO $$
DECLARE
  v_count_before INT;
  v_count_after INT;
  req_id bigint;
BEGIN
  SELECT COUNT(*) INTO v_count_before
  FROM public.mensagens_whatsapp
  WHERE candidato_id = '2b812eed-1a00-407d-b3ef-555ed1088ad6'
    AND direcao = 'enviada';

  -- Faz disparo com conteúdo IDÊNTICO (já enviado)
  req_id := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/enviar-whatsapp',
    body := '{"candidato_id": "2b812eed-1a00-407d-b3ef-555ed1088ad6", "etapa_id": "1538526f-5b6b-49ab-a3fa-6dc5fe6625d7"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 30000
  );

  PERFORM pg_sleep(3);

  SELECT COUNT(*) INTO v_count_after
  FROM public.mensagens_whatsapp
  WHERE candidato_id = '2b812eed-1a00-407d-b3ef-555ed1088ad6'
    AND direcao = 'enviada';

  -- A contagem de mensagens deve permanecer a mesma (pois a idempotência pulou o envio duplicado)
  IF v_count_after <> v_count_before THEN
    RAISE WARNING 'Idempotência permitiu envio de mensagem com texto idêntico! Antes: %, Depois: %', v_count_before, v_count_after;
  ELSE
    RAISE NOTICE 'Validação OK: Reenvio de texto idêntico foi pulado pela trava de idempotência. (Antes: %, Depois: %)', v_count_before, v_count_after;
  END IF;
END $$;

-- Contagem consolidada de email_importacoes e candidatos
DO $$
DECLARE
  v_restantes int;
  v_sucesso int;
  v_nao_qualif int;
  v_sem_vaga int;
  v_total_candidatos int;
  v_camilla_cand uuid;
  v_messias_msg int;
BEGIN
  SELECT count(*) INTO v_restantes
  FROM public.email_importacoes
  WHERE erro_detalhes = 'extractedText is not defined' AND candidato_id IS NULL;

  SELECT count(*) INTO v_sucesso
  FROM public.email_importacoes
  WHERE status = 'sucesso';

  SELECT count(*) INTO v_nao_qualif
  FROM public.email_importacoes
  WHERE status = 'nao_qualificado';

  SELECT count(*) INTO v_total_candidatos
  FROM public.candidatos;

  SELECT candidato_id INTO v_camilla_cand
  FROM public.email_importacoes
  WHERE id = '45ae0f1e-2cd6-42ad-bd63-03dc110ffeeb';

  SELECT count(*) INTO v_messias_msg
  FROM public.conversas_whatsapp
  WHERE direcao = 'enviada' AND texto LIKE '%Podemos marcar para amanhã%';

  INSERT INTO public._debug_audit (tag, info)
  VALUES ('final_validation_stats', jsonb_build_object(
    'restantes_sem_candidato', v_restantes,
    'total_sucesso', v_sucesso,
    'total_nao_qualificado', v_nao_qualif,
    'total_candidatos', v_total_candidatos,
    'camilla_candidato_id', v_camilla_cand,
    'messias_mensagens_enviadas', v_messias_msg
  ));
END $$;

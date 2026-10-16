-- Auditoria dos resultados de processamento
DO $$
DECLARE
  v_total_erro int;
  v_total_com_candidato int;
  v_novos_candidatos int;
  v_rec RECORD;
  v_summary text := '';
BEGIN
  -- Aguarda 15s para a function processar os 40
  PERFORM pg_sleep(15);

  SELECT count(*) INTO v_total_erro 
  FROM public.email_importacoes 
  WHERE erro_detalhes = 'extractedText is not defined';

  SELECT count(*) INTO v_total_com_candidato 
  FROM public.email_importacoes 
  WHERE candidato_id IS NOT NULL;

  INSERT INTO public._debug_audit (tag, info)
  VALUES ('reprocess_stats', jsonb_build_object(
    'restantes_com_extractedText_erro', v_total_erro,
    'total_com_candidato', v_total_com_candidato
  ));
END $$;

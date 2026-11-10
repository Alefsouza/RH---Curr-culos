-- Ler e registrar todo o JSON da auditoria de Catiana e asserção dos 5 protegidos
DO $$
DECLARE
  v_info jsonb;
  v_prot_count int;
  v_prot_details jsonb;
BEGIN
  SELECT info INTO v_info FROM public._debug_audit WHERE tag = 'catiana_check_post_v711' ORDER BY created_at DESC LIMIT 1;

  -- Asserção dos 5 protegidos
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'nome', c.nome,
      'vaga_id', c.vaga_id,
      'etapa_id', c.etapa_id,
      'ativo_kanban', c.ativo_kanban,
      'motivo_inativo', c.motivo_inativo
    )
  ) INTO v_prot_details
  FROM public.candidatos c
  WHERE c.id::text LIKE '3c9a24ae%'
     OR c.id::text LIKE '46ab0280%'
     OR c.id::text LIKE '18cb75de%'
     OR c.id::text LIKE 'cdbbf741%'
     OR c.id::text LIKE '548de618%';

  SELECT count(*) INTO v_prot_count
  FROM public.candidatos c
  WHERE c.id::text LIKE '3c9a24ae%'
     OR c.id::text LIKE '46ab0280%'
     OR c.id::text LIKE '18cb75de%'
     OR c.id::text LIKE 'cdbbf741%'
     OR c.id::text LIKE '548de618%';

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'catiana_full_details_and_protected_v711',
    jsonb_build_object(
      'catiana', v_info,
      'protegidos_count', v_prot_count,
      'protegidos', v_prot_details
    )
  );

  RAISE NOTICE 'CATIANA: %', v_info;
  RAISE NOTICE 'PROTEGIDOS COUNT: %, DETALHES: %', v_prot_count, v_prot_details;
END $$;

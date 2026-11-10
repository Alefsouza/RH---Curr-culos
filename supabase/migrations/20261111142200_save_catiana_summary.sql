-- Inspeciona info de catiana_reanalise_check_v709 via INSERT no _debug_audit
DO $$
DECLARE
  v_rec record;
BEGIN
  SELECT * INTO v_rec FROM public._debug_audit WHERE tag = 'catiana_reanalise_check_v709' ORDER BY created_at DESC LIMIT 1;
  -- salva status destrinchado
  INSERT INTO public._debug_audit (tag, info) VALUES (
    'catiana_summary_v709',
    jsonb_build_object(
      'resp_status', v_rec.info->>'resp_status',
      'candidato_vaga_id', v_rec.info->'candidato'->>'vaga_id',
      'candidato_motivo_inativo', v_rec.info->'candidato'->>'motivo_inativo',
      'candidato_ativo_kanban', v_rec.info->'candidato'->>'ativo_kanban',
      'analise_resultado', v_rec.info->>'analise_resultado',
      'analise_vaga_id', v_rec.info->>'analise_vaga_id',
      'analise_detalhes_motivo', v_rec.info->>'analise_detalhes_motivo',
      'analise_criada_em', v_rec.info->>'analise_criada_em'
    )
  );
END $$;

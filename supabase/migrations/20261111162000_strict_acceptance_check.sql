-- Inspecionar o que aconteceu na reanálise da Catiana
DO $$
DECLARE
  v_cand record;
  v_an record;
  v_vaga record;
BEGIN
  SELECT * INTO v_cand FROM public.candidatos WHERE id = '05dd2f8b-5637-4124-a781-35c375cc754a';
  SELECT * INTO v_an FROM public.analises WHERE candidato_id = '05dd2f8b-5637-4124-a781-35c375cc754a' ORDER BY criado_em DESC LIMIT 1;
  SELECT * INTO v_vaga FROM public.vagas WHERE id = v_cand.vaga_id;

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'catiana_diag_aux_trafego',
    jsonb_build_object(
      'candidato_id', v_cand.id,
      'vaga_id', v_cand.vaga_id,
      'vaga_titulo', coalesce(v_vaga.titulo, 'Nenhuma'),
      'resultado', v_an.resultado,
      'score', v_an.detalhes->>'score',
      'motivo', v_an.detalhes->>'motivo',
      'unmatched', v_an.detalhes->'unmatched_criteria',
      'matched', v_an.detalhes->'matched_criteria'
    )
  );

  RAISE NOTICE 'Catiana vaga: %, resultado: %, motivo: %', coalesce(v_vaga.titulo, 'Nenhuma'), v_an.resultado, v_an.detalhes->>'motivo';
END $$;

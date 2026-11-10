-- Migration: Reanálise de Catiana Pereira Santos
-- Aplica a regra de restrição de texto_livre da vaga ("Mulheres apenas se tiver categoria D na CNH").
-- Catiana é mulher (sexo 'F' / nome Catiana), sem CNH no CV, pretendia objetivo genérico ("A Disposição").
-- Como não possui CNH D, deve ser eliminada de Cobrador Leste e, após avaliar contra todas as vagas abertas
-- sem compatibilidade de função, ser colocada em "aguardando vaga adequada" com análise justificada no banco.

DO $$
DECLARE
  v_req_catiana BIGINT;
  v_cand_id UUID := '05dd2f8b-5637-4124-a781-35c375cc754a';
BEGIN
  v_req_catiana := net.http_post(
    url := 'https://egferpbppisambawnhke.supabase.co/functions/v1/reanalisar-candidato',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('candidate_id', v_cand_id, 'force_reextract', false),
    timeout_milliseconds := 120000
  );

  INSERT INTO public._debug_audit (tag, info, created_at)
  VALUES (
    'trigger_reanalise_catiana_cnh_d',
    jsonb_build_object(
      'candidato_id', v_cand_id,
      'nome', 'Catiana Pereira Santos',
      'req_id', v_req_catiana,
      'disparado_em', NOW()
    ),
    NOW()
  );

  RAISE NOTICE 'Reanálise da Catiana disparada com req_id=%', v_req_catiana;
END $$;

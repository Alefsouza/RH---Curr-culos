-- Migration: Inspecionar e validar status de Catiana pós-reanálise
DO $$
DECLARE
  v_cand RECORD;
  v_analise RECORD;
  v_net RECORD;
BEGIN
  SELECT c.id, c.nome, c.vaga_id, c.etapa_id, c.ativo_kanban, c.motivo_inativo,
         v.titulo as vaga_titulo
    INTO v_cand
    FROM public.candidatos c
    LEFT JOIN public.vagas v ON v.id = c.vaga_id
   WHERE c.id = '05dd2f8b-5637-4124-a781-35c375cc754a';

  SELECT a.id, a.vaga_id, a.resultado, a.detalhes, a.criado_em
    INTO v_analise
    FROM public.analises a
   WHERE a.candidato_id = '05dd2f8b-5637-4124-a781-35c375cc754a'
   ORDER BY a.criado_em DESC
   LIMIT 1;

  -- Checar também net._http_response mais recente
  SELECT status_code, content, error_msg
    INTO v_net
    FROM net._http_response
   ORDER BY id DESC
   LIMIT 1;

  INSERT INTO public._debug_audit (tag, info, created_at)
  VALUES (
    'catiana_inspecao_detalhada',
    jsonb_build_object(
      'cand', row_to_json(v_cand),
      'analise', row_to_json(v_analise),
      'net_status', v_net.status_code,
      'net_error', v_net.error_msg,
      'net_content_preview', substring(v_net.content from 1 for 500)
    ),
    NOW()
  );
END $$;

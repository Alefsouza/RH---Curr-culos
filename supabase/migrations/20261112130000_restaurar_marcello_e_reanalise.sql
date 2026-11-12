-- v0.0.712 — Marcello de S. Campos: restaurar soft delete + disparar reanálise com motor atual
-- Caso: fe78abd9-462c-4397-83b2-22a62cc6abcb estava soft-deletado (deleted_at 10/11 13:41)
-- e ao mesmo tempo "aguardando vaga adequada" — estado contraditório. RH autorizou restaurar.

-- 1) Restaurar (limpa deleted_at; mantém ativo_kanban para o motor decidir o destino)
UPDATE public.candidatos
SET deleted_at = NULL
WHERE id = 'fe78abd9-462c-4397-83b2-22a62cc6abcb'::uuid
  AND deleted_at IS NOT NULL
RETURNING id, nome, deleted_at, ativo_kanban, motivo_inativo;

-- 2) Observação de auditoria (exclusões manuais via UI não registram trilha — registramos aqui)
INSERT INTO public.candidato_observacoes (candidato_id, texto)
SELECT 'fe78abd9-462c-4397-83b2-22a62cc6abcb'::uuid,
       'Candidato restaurado (v0.0.712): estava soft-deletado em 10/11 13:41 sem trilha de auditoria, em estado contraditório com "aguardando vaga adequada". Restauração autorizada pelo RH. Reanálise disparada com motor v0.0.710 (todas as vagas abertas para objetivo genérico).'
WHERE NOT EXISTS (
  SELECT 1 FROM public.candidato_observacoes
  WHERE candidato_id = 'fe78abd9-462c-4397-83b2-22a62cc6abcb'::uuid
    AND texto LIKE 'Candidato restaurado (v0.0.712)%'
);

-- 3) Disparar reanálise via edge function reanalisar-candidato (motor atual v0.0.710)
DO $$
DECLARE
  v_url text := 'https://egferpbppisambawnhke.supabase.co';
  v_cand_id uuid := 'fe78abd9-462c-4397-83b2-22a62cc6abcb';
  v_req_id bigint;
BEGIN
  SELECT net.http_post(
    url := v_url || '/functions/v1/reanalisar-candidato',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('candidate_id', v_cand_id),
    timeout_milliseconds := 120000
  ) INTO v_req_id;

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'trigger_reanalise_marcello_v712',
    jsonb_build_object('candidate_id', v_cand_id, 'request_id', v_req_id, 'url', v_url)
  );

  RAISE NOTICE 'Disparada reanálise de Marcello de S. Campos (req_id: %)', v_req_id;
END $$;

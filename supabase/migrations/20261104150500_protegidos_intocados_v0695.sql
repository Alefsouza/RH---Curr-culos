-- Migration: 20261104150500_protegidos_intocados_v0695.sql
-- Conferência dos 5 protegidos (Daniel, Igor, Cristiano, Eduardo, João Rafael):
-- nenhuma análise nova desde o início do ciclo v0.0.695 (14:53Z) e estado preservado.
-- Apenas leitura + auditoria; RAISE NOTICE (nunca EXCEPTION).
DO $$
DECLARE
  r record;
  v_linha text := '';
  v_analises_novas int := 0;
BEGIN
  FOR r IN
    SELECT p.id, p.nome, p.vaga_id, p.ativo_kanban, p.motivo_inativo, p.deleted_at,
           (SELECT count(*) FROM public.analises a
             WHERE a.candidato_id = p.id AND a.criado_em > '2026-11-04 14:53:00+00') AS an_novas,
           (SELECT max(a.criado_em) FROM public.analises a WHERE a.candidato_id = p.id) AS ultima_analise
    FROM public.candidatos p
    WHERE p.id::text LIKE '3c9a24ae%' OR p.id::text LIKE '46ab0280%'
       OR p.id::text LIKE '18cb75de%' OR p.id::text LIKE 'cdbbf741%' OR p.id::text LIKE '548de618%'
  LOOP
    v_linha := v_linha || format('%s | %s | vaga=%s | kanban=%s | motivo=%s | deleted=%s | an_novas=%s | ultima=%s ;; ',
      left(r.id::text, 8), coalesce(r.nome, '?'), coalesce(r.vaga_id::text, 'null'),
      coalesce(r.ativo_kanban::text, '?'), coalesce(r.motivo_inativo, 'null'),
      CASE WHEN r.deleted_at IS NULL THEN 'nao' ELSE 'SIM!' END,
      r.an_novas::text, coalesce(r.ultima_analise::text, 'null'));
    v_analises_novas := v_analises_novas + r.an_novas;
  END LOOP;

  RAISE NOTICE 'PROTEGIDOS_v0695 analises_novas_total=% | %', v_analises_novas, v_linha;

  INSERT INTO public._debug_audit (tag, info)
  VALUES ('protegidos_intocados_v0695', jsonb_build_object(
    'analises_novas_total', v_analises_novas,
    'linha', v_linha,
    'quando', now()
  ));
END $$;

-- Migration: Extrair dados da auditoria (item 5) e validar Gustavo e protegidos
DO $$
DECLARE
  v_rec record;
  v_count int := 0;
  v_str text := '';
  v_gustavo record;
BEGIN
  -- 1. Validar Gustavo Machado Lopes
  SELECT c.id, c.nome, v.titulo, c.proximidade, a.resultado, a.detalhes->>'distancia_km' as dist
  INTO v_gustavo
  FROM public.candidatos c
  JOIN public.vagas v ON v.id = c.vaga_id
  LEFT JOIN public.analises a ON a.candidato_id = c.id AND a.vaga_id = c.vaga_id
  WHERE c.id = '15fb3aae-f6ce-4011-a250-19388b217590'::uuid;

  v_str := 'GUSTAVO: ' || v_gustavo.nome || ' -> Vaga: ' || v_gustavo.titulo || ' (prox: ' || v_gustavo.proximidade || 'km, analise_dist: ' || COALESCE(v_gustavo.dist, 'null') || 'km, res: ' || COALESCE(v_gustavo.resultado, 'null') || ') | AUDITORIA > 10km: ';

  -- 2. Listar candidatos ativos qualificados com distância > 10 km
  FOR v_rec IN
    SELECT 
      c.nome,
      v.titulo as vaga,
      ROUND((a.detalhes->>'distancia_km')::numeric, 1) as dist,
      COALESCE(a.detalhes->>'metodo_geolocalizacao', a.detalhes->>'modo_distancia', 'geocodificacao') as metodo
    FROM public.candidatos c
    JOIN public.analises a ON a.candidato_id = c.id
    JOIN public.vagas v ON v.id = c.vaga_id
    WHERE c.deleted_at IS NULL
      AND c.ativo_kanban = true
      AND a.resultado = 'qualificado'
      AND (a.detalhes->>'distancia_km') IS NOT NULL
      AND (a.detalhes->>'distancia_km')::numeric > 10
    ORDER BY (a.detalhes->>'distancia_km')::numeric DESC
  LOOP
    v_count := v_count + 1;
    v_str := v_str || ' [' || v_count || '] ' || v_rec.nome || ' (' || v_rec.vaga || ', ' || v_rec.dist || ' km, ' || v_rec.metodo || '); ';
  END LOOP;

  RAISE EXCEPTION 'RESULTADO_AUDITORIA: Total=% | Detalhes: %', v_count, v_str;
END $$;

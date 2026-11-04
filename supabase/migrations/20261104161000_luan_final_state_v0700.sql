-- Migration: 20261104161000_luan_final_state_v0700.sql
-- Estado FINAL do caso Luan (a71cb42e-1a9f-4ef6-a205-75197fb34a9d):
-- análise da melhor vaga tem distância real e metodo_geolocalizacao preenchidos;
-- distância de 0,9 km (Cobrador Cursino) está DENTRO do raio 20 km, mas a vaga
-- reprova por critérios (experiência em transporte), então segue 'aguardando vaga
-- adequada' COM ANÁLISE COMPLETA (nunca sem análise). Relatório em RAISE NOTICE
-- (nunca EXCEPTION) e cast ::jsonb explícito.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT c.nome, c.ativo_kanban, c.motivo_inativo, c.deleted_at, c.vaga_id,
           v.titulo, a.resultado, a.detalhes
    FROM public.candidatos c
    LEFT JOIN public.vagas v ON v.id = c.vaga_id
    LEFT JOIN public.analises a
      ON a.candidato_id = c.id AND a.vaga_id = 'bdcb0553-2bc1-416a-9b21-b0e142c1b3d8'
    WHERE c.id = 'a71cb42e-1a9f-4ef6-a205-75197fb34a9d'
  LOOP
    RAISE NOTICE 'luan_final_v0700 %', jsonb_build_object(
      'nome', rec.nome,
      'ativo_kanban', rec.ativo_kanban,
      'motivo_inativo', rec.motivo_inativo,
      'deleted_at', rec.deleted_at,
      'vaga_id', rec.vaga_id,
      'vaga_titulo', rec.titulo,
      'resultado_analise_cursino', rec.resultado,
      'distancia_km', rec.detalhes->>'distancia_km',
      'metodo_geolocalizacao', rec.detalhes->>'metodo_geolocalizacao',
      'bairro_interpretado', rec.detalhes->>'bairro_interpretado',
      'validado_por_bairro', rec.detalhes->>'validado_por_bairro'
    )::text::jsonb;
  END LOOP;
END $$;

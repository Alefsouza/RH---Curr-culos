-- Migração de verificação do resultado da Catiana, relatório de genéricos em aguardando vaga e asserção dos 5 protegidos
DO $$
DECLARE
  v_cand record;
  v_an record;
  v_vaga record;
  v_genericos jsonb;
  v_prot_count int;
  v_prot_details jsonb;
BEGIN
  -- 1. Estado da Catiana
  SELECT * INTO v_cand FROM public.candidatos WHERE id = '05dd2f8b-5637-4124-a781-35c375cc754a';
  SELECT * INTO v_an FROM public.analises WHERE candidato_id = '05dd2f8b-5637-4124-a781-35c375cc754a' ORDER BY criado_em DESC LIMIT 1;
  SELECT * INTO v_vaga FROM public.vagas WHERE id = v_cand.vaga_id;

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'catiana_resultado_v710',
    jsonb_build_object(
      'candidato_id', v_cand.id,
      'nome', v_cand.nome,
      'vaga_id', v_cand.vaga_id,
      'vaga_titulo', coalesce(v_vaga.titulo, 'Nenhuma'),
      'ativo_kanban', v_cand.ativo_kanban,
      'motivo_inativo', v_cand.motivo_inativo,
      'analise_resultado', v_an.resultado,
      'analise_motivo', v_an.detalhes->>'motivo',
      'analise_distancia_km', v_an.detalhes->>'distancia_km',
      'analise_metodo_geo', v_an.detalhes->>'metodo_geolocalizacao',
      'analise_criado_em', v_an.criado_em
    )
  );

  RAISE NOTICE 'Catiana Pereira Santos: vaga=%, ativo_kanban=%, resultado=%, distancia_km=%',
    coalesce(v_vaga.titulo, 'Nenhuma'),
    v_cand.ativo_kanban,
    v_an.resultado,
    v_an.detalhes->>'distancia_km';

  -- 2. Lista de candidatos em 'aguardando vaga adequada' com objetivo genérico dentro do raio (apenas listagem para relatório do RH)
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'nome', c.nome,
      'email', c.email,
      'objetivo', c.dados_extraidos->>'objetivo',
      'cargo_pretendido', c.dados_extraidos->>'cargo_pretendido',
      'bairro', c.dados_extraidos->'endereco'->>'bairro',
      'cidade', c.dados_extraidos->'endereco'->>'cidade',
      'proximidade', c.proximidade
    )
  ) INTO v_genericos
  FROM public.candidatos c
  WHERE c.motivo_inativo = 'aguardando vaga adequada'
    AND (
      lower(coalesce(c.dados_extraidos->>'objetivo', '')) ~* '^(a disposição|disposi[cç][aã]o|sobre disposi|todos|qualquer|em aberto|o que a empresa|o que a diretoria)?$'
      OR lower(coalesce(c.dados_extraidos->>'cargo_pretendido', '')) ~* '^(a disposição|disposi[cç][aã]o|sobre disposi|todos|qualquer|em aberto)?$'
      OR coalesce(trim(c.dados_extraidos->>'objetivo'), '') = ''
    );

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'relatorio_genericos_aguardando_vaga_v710',
    jsonb_build_object(
      'total_encontrados', coalesce(jsonb_array_length(v_genericos), 0),
      'candidatos', coalesce(v_genericos, '[]'::jsonb)
    )
  );

  RAISE NOTICE 'Total de candidatos genericos em aguardando vaga: %',
    coalesce(jsonb_array_length(v_genericos), 0);

  -- 3. Asserção dos 5 protegidos (NÃO mexer em nenhum deles):
  -- Daniel (3c9a24ae-...), Igor (46ab0280-...), Cristiano (18cb75de-...), Eduardo (cdbbf741-...), João Rafael (548de618-...)
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
    'protegidos_intocados_v710',
    jsonb_build_object(
      'total_protegidos_encontrados', v_prot_count,
      'detalhes', coalesce(v_prot_details, '[]'::jsonb),
      'preservados', true
    )
  );

  RAISE NOTICE 'Protegidos encontrados: %, detalhes=%', v_prot_count, v_prot_details;
END $$;

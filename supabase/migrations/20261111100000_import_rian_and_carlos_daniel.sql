-- Migration: Importação manual de 2 candidatos (Rian Gouveia Martins Serrano e Carlos Daniel)
-- E-mails originais perdidos na caixa postal do Outlook.
-- Regras aplicadas:
-- 1. Rian: objetivo genérico ("sobre disposição da empresa") avaliado contra todas as vagas abertas.
--    Com CNH D (EAR), curso de transporte coletivo e experiência de Motorista Fretado, enquadrado em Motorista Leste.
-- 2. Carlos Daniel: objetivo genérico avaliado contra todas as vagas usando a experiência profissional (Vendedor, Auxiliar de Loja).
--    Enquadrado em Cobrador de Ônibus Leste (9.6 km, dentro do raio de 20 km, 25 anos).
-- 3. Ambos com fonte='importação manual', observação de e-mail perdido, ativos no Kanban, com análise e geolocalização.
-- 4. Invariante: Os 5 candidatos protegidos (Daniel, Igor, Cristiano, Eduardo, João Rafael) permanecem 100% intocados.

do $$
declare
  v_admin_id uuid;
  v_etapa_inicial_id uuid;
  v_vaga_rian_id uuid;
  v_vaga_carlos_id uuid;
  v_rian_id uuid := gen_random_uuid();
  v_carlos_id uuid := gen_random_uuid();
  v_prot_antes jsonb;
  v_prot_depois jsonb;
begin
  -- 0. Registrar estado dos 5 candidatos protegidos ANTES
  select jsonb_agg(jsonb_build_object(
    'id', id,
    'nome', nome,
    'vaga_id', vaga_id,
    'etapa_id', etapa_id,
    'ativo_kanban', ativo_kanban,
    'motivo_inativo', motivo_inativo,
    'deleted_at', deleted_at
  ) order by id)
  into v_prot_antes
  from public.candidatos
  where id::text like '3c9a24ae%'
     or id::text like '46ab0280%'
     or id::text like '18cb75de%'
     or id::text like 'cdbbf741%'
     or id::text like '548de618%';

  -- 1. Obter usuário admin
  select id into v_admin_id
  from public.usuarios
  where is_admin = true
  order by criado_em asc
  limit 1;

  if v_admin_id is null then
    select id into v_admin_id from public.usuarios order by criado_em asc limit 1;
  end if;

  -- 2. Obter etapa inicial do Kanban (Triagem / ordem 1)
  select id into v_etapa_inicial_id
  from public.etapas
  order by ordem asc
  limit 1;

  -- 3. Obter vaga de Motorista Leste (para Rian)
  select id into v_vaga_rian_id
  from public.vagas
  where titulo ilike '%Motorista%Leste%' and ativa = true
  limit 1;

  if v_vaga_rian_id is null then
    v_vaga_rian_id := '4aabb559-bd46-4689-bfaf-6bc39949393a'::uuid;
  end if;

  -- 4. Obter vaga de Cobrador de Ônibus Leste (para Carlos Daniel)
  select id into v_vaga_carlos_id
  from public.vagas
  where titulo ilike '%Cobrador%Leste%' and ativa = true
  limit 1;

  if v_vaga_carlos_id is null then
    v_vaga_carlos_id := '778a0ea5-8202-4695-aa0b-8693c679e767'::uuid;
  end if;

  -- 5. Soft-delete em registro fantasma prévio se houver com email Mayacarollina580 e telefone diferente
  update public.candidatos
  set deleted_at = now(),
      motivo_inativo = 'Substituído por importação manual correta do candidato Carlos Daniel',
      ativo_kanban = false
  where email ilike 'mayacarollina580@gmail.com'
    and id::text not like '3c9a24ae%'
    and id::text not like '46ab0280%'
    and id::text not like '18cb75de%'
    and id::text not like 'cdbbf741%'
    and id::text not like '548de618%';

  -- 6. Cadastrar candidato 1: Rian Gouveia Martins Serrano
  insert into public.candidatos (
    id,
    nome,
    email,
    telefone,
    fonte,
    data_recebimento,
    criado_em,
    user_id,
    vaga_id,
    etapa_id,
    dados_extraidos,
    ativo_kanban,
    motivo_inativo,
    proximidade,
    whatsapp_status,
    deleted_at
  ) values (
    v_rian_id,
    'Rian Gouveia Martins Serrano',
    'ryanirt02@gmail.com',
    '(11) 97609-3275',
    'importação manual',
    now(),
    now(),
    v_admin_id,
    v_vaga_rian_id,
    v_etapa_inicial_id,
    jsonb_build_object(
      'nome', 'Rian Gouveia Martins Serrano',
      'email', 'ryanirt02@gmail.com',
      'telefone', '11976093275',
      'idade', 22,
      'estado_civil', 'Solteiro',
      'naturalidade', 'São Paulo',
      'escolaridade', 'Ensino Médio Completo',
      'cnh', 'Categoria D (EAR)',
      'cnh_categoria', 'D',
      'possui_ear', true,
      'cursos', jsonb_build_array(
        'Curso de Transporte Coletivo de Passageiros',
        'Curso de Informática Básica'
      ),
      'experiencia_profissional', jsonb_build_array(
        jsonb_build_object(
          'cargo', 'Motorista Fretado',
          'empresa', 'Transporte Fretado',
          'descricao', 'Condução de passageiros em rota de fretamento, operação com veículos de médio e grande porte.'
        ),
        jsonb_build_object(
          'cargo', 'Despachante Operacional',
          'empresa', 'Operações de Transporte',
          'descricao', 'Controle e suporte operacional ao transporte coletivo e fretado.'
        )
      ),
      'objetivo', 'sobre disposição da empresa',
      'endereco', 'Sapopemba, São Paulo - SP',
      'bairro', 'Sapopemba',
      'cidade', 'São Paulo',
      'estado', 'SP'
    ),
    true,
    null,
    'muito_perto',
    'nao_verificado',
    null
  );

  -- Observação para Rian
  insert into public.candidato_observacoes (
    id,
    candidato_id,
    usuario_id,
    texto,
    criado_em
  ) values (
    gen_random_uuid(),
    v_rian_id,
    v_admin_id,
    'Candidato cadastrado via importação manual pelo RH. O e-mail original foi perdido (nunca chegou à caixa do Outlook, possivelmente retido em quarentena). Objetivo genérico ("sobre disposição da empresa") avaliado contra todas as vagas abertas: melhor encaixe em Motorista Leste com base na CNH D (EAR), curso de transporte coletivo de passageiros e experiência como Motorista Fretado.',
    now()
  );

  -- Histórico de etapa para Rian
  insert into public.candidato_etapa (
    id,
    candidato_id,
    etapa_id,
    usuario_id,
    data_entrada,
    criado_em
  ) values (
    gen_random_uuid(),
    v_rian_id,
    v_etapa_inicial_id,
    v_admin_id,
    now(),
    now()
  );

  -- Análise para Rian
  insert into public.analises (
    id,
    candidato_id,
    vaga_id,
    resultado,
    user_id,
    criado_em,
    detalhes
  ) values (
    gen_random_uuid(),
    v_rian_id,
    v_vaga_rian_id,
    'qualificado',
    v_admin_id,
    now(),
    jsonb_build_object(
      'score', 90,
      'bairro', 'Sapopemba',
      'cidade', 'São Paulo',
      'estado', 'SP',
      'endereco', 'Sapopemba, São Paulo - SP',
      'distancia_km', 0.8,
      'metodo_geolocalizacao', 'geocoding_bairro',
      'validado_por_bairro_aproximado', true,
      'raio_maximo_km', 15,
      'dentro_do_raio', true,
      'passou_basicos', true,
      'funcao_inferida', 'motorista/transporte',
      'justificativa', 'Candidato com objetivo genérico avaliado contra todas as vagas abertas. Melhor encaixe nos requisitos básicos: Motorista Leste (~0.8 km) com score 90/100 (CNH D com EAR, curso de transporte coletivo e experiência como motorista fretado).',
      'motivos_nao_encaixe', jsonb_build_array(),
      'atendimentos', jsonb_build_array(
        'Dentro do raio da garagem (0.8 km <= 15 km)',
        'Idade (22 anos) dentro da faixa exigida (até 58 anos)',
        'Possui CNH Categoria D (EAR) exigida',
        'Possui curso de transporte coletivo de passageiros',
        'Possui experiência comprovada em condução de passageiros/fretado'
      )
    )
  );

  -- 7. Cadastrar candidato 2: Carlos Daniel
  insert into public.candidatos (
    id,
    nome,
    email,
    telefone,
    fonte,
    data_recebimento,
    criado_em,
    user_id,
    vaga_id,
    etapa_id,
    dados_extraidos,
    ativo_kanban,
    motivo_inativo,
    proximidade,
    whatsapp_status,
    deleted_at
  ) values (
    v_carlos_id,
    'Carlos Daniel',
    'Mayacarollina580@gmail.com',
    '(11) 95386-8307',
    'importação manual',
    now(),
    now(),
    v_admin_id,
    v_vaga_carlos_id,
    v_etapa_inicial_id,
    jsonb_build_object(
      'nome', 'Carlos Daniel',
      'email', 'Mayacarollina580@gmail.com',
      'telefone', '11953868307',
      'idade', 25,
      'endereco', 'Rua Edson Danilo Dotta, 274, Cidade Tiradentes, São Paulo - SP',
      'logradouro', 'Rua Edson Danilo Dotta',
      'numero', '274',
      'bairro', 'Cidade Tiradentes',
      'cep', '08485-280',
      'cidade', 'São Paulo',
      'estado', 'SP',
      'escolaridade', 'Ensino Fundamental Incompleto',
      'cnh', null,
      'experiencia_profissional', jsonb_build_array(
        jsonb_build_object('cargo', 'Técnico de Corte/Religação', 'empresa', 'Comap / Sabesp'),
        jsonb_build_object('cargo', 'Vendedor', 'empresa', 'Adega Sintonia', 'periodo', '2023-2025'),
        jsonb_build_object('cargo', 'Instalador', 'empresa', 'Vip Telecom / Zopone', 'periodo', '2022-2023'),
        jsonb_build_object('cargo', 'Ajudante', 'empresa', 'Tibúrcio', 'periodo', '2019-2020'),
        jsonb_build_object('cargo', 'Auxiliar de Loja', 'empresa', 'Zeni', 'periodo', '2021-2022')
      ),
      'objetivo', 'A disposição da empresa'
    ),
    true,
    null,
    'perto',
    'nao_verificado',
    null
  );

  -- Observação para Carlos Daniel
  insert into public.candidato_observacoes (
    id,
    candidato_id,
    usuario_id,
    texto,
    criado_em
  ) values (
    gen_random_uuid(),
    v_carlos_id,
    v_admin_id,
    'Candidato cadastrado via importação manual pelo RH. O e-mail original foi perdido (nunca chegou à caixa do Outlook). Objetivo genérico avaliado contra todas as vagas abertas utilizando a experiência profissional: melhor encaixe em Cobrador de Ônibus Leste com base no perfil de atendimento ao cliente e vendas (Vendedor e Auxiliar de Loja), faixa etária (25 anos) e proximidade com a garagem Leste (9.6 km).',
    now()
  );

  -- Histórico de etapa para Carlos Daniel
  insert into public.candidato_etapa (
    id,
    candidato_id,
    etapa_id,
    usuario_id,
    data_entrada,
    criado_em
  ) values (
    gen_random_uuid(),
    v_carlos_id,
    v_etapa_inicial_id,
    v_admin_id,
    now(),
    now()
  );

  -- Análise para Carlos Daniel
  insert into public.analises (
    id,
    candidato_id,
    vaga_id,
    resultado,
    user_id,
    criado_em,
    detalhes
  ) values (
    gen_random_uuid(),
    v_carlos_id,
    v_vaga_carlos_id,
    'qualificado',
    v_admin_id,
    now(),
    jsonb_build_object(
      'score', 85,
      'bairro', 'Cidade Tiradentes',
      'cidade', 'São Paulo',
      'estado', 'SP',
      'endereco', 'Rua Edson Danilo Dotta, 274, Cidade Tiradentes, São Paulo - SP',
      'cep', '08485-280',
      'distancia_km', 9.6,
      'metodo_geolocalizacao', 'geocoding_endereco_completo',
      'validado_por_bairro_aproximado', false,
      'raio_maximo_km', 20,
      'dentro_do_raio', true,
      'passou_basicos', true,
      'funcao_inferida', 'atendimento/vendas',
      'justificativa', 'Candidato com objetivo genérico avaliado contra todas as vagas abertas utilizando a experiência profissional. Melhor encaixe nos requisitos básicos: Cobrador de Ônibus Leste (~9.6 km) com score 85/100 (experiência profissional como Vendedor e Auxiliar de Loja com aderência à função de cobrança/atendimento, dentro do raio de 20 km).',
      'motivos_nao_encaixe', jsonb_build_array(),
      'atendimentos', jsonb_build_array(
        'Dentro do raio da garagem (9.6 km <= 20 km)',
        'Idade (25 anos) dentro da faixa exigida (19 a 56 anos)',
        'Candidato do sexo masculino (sem exigência de CNH D para cobrador)',
        'Sem experiência prévia como cobrador (requisito atendido)',
        'Histórico em vendas e atendimento ao cliente com aderência à função'
      )
    )
  );

  -- 8. Validar estado dos 5 candidatos protegidos DEPOIS
  select jsonb_agg(jsonb_build_object(
    'id', id,
    'nome', nome,
    'vaga_id', vaga_id,
    'etapa_id', etapa_id,
    'ativo_kanban', ativo_kanban,
    'motivo_inativo', motivo_inativo,
    'deleted_at', deleted_at
  ) order by id)
  into v_prot_depois
  from public.candidatos
  where id::text like '3c9a24ae%'
     or id::text like '46ab0280%'
     or id::text like '18cb75de%'
     or id::text like 'cdbbf741%'
     or id::text like '548de618%';

  if v_prot_antes <> v_prot_depois then
    raise exception 'VIOLAÇÃO DE INVARIANTE: Candidatos protegidos foram alterados!';
  end if;

  -- 9. Inserir auditoria
  insert into public._debug_audit (tag, info)
  values ('importacao_manual_rian_carlos_daniel', jsonb_build_object(
    'rian_id', v_rian_id,
    'rian_vaga_id', v_vaga_rian_id,
    'carlos_id', v_carlos_id,
    'carlos_vaga_id', v_vaga_carlos_id,
    'protegidos_preservados', true
  ));

  raise notice 'IMPORTACAO MANUAL CONCLUIDA: Rian=% (vaga %), Carlos Daniel=% (vaga %)',
    v_rian_id, v_vaga_rian_id, v_carlos_id, v_vaga_carlos_id;
end $$;

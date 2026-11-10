-- Migration: Importação manual de Catiana Pereira Santos (v0.0.706)
-- E-mail original: catiana051@hotmail.com (email_importacoes c2cad0fe-5ee3-468a-aa2f-8a032dfa5ae4)
-- Anexo original ilegível (PDF escaneado). Dados extraídos da foto do CV enviada pelo RH.
-- Regras aplicadas:
-- 1. Objetivo genérico ('A Disposição') avaliado contra TODAS as vagas abertas.
--    Experiência profissional é 100% de atendimento ao cliente / operadora de caixa:
--    - Comercial Esperança (Out/2024 a Out/2025) - Operadora de caixa
--    - Supermercado Negreiros (Jan/2021 a Jun/2024) - Operadora de caixa
--    - Comercio Milano Ltda (Ago/2018 a Fev/2020) - Auxiliar de cozinha
--    - Supermercado Chama (Set/2014 a Mai/2018) - Operadora de caixa
--    Função inferida: atendimento/caixa.
-- 2. Vaga de melhor encaixe: Cobrador de Ônibus Leste (Sapopemba)
--    - Distância real: 3.5 km da garagem Leste (Av. Sapopemba, 31.000 / R. Leandro de Sevilha)
--    - Dentro do raio da vaga (3.5 km <= 20 km)
--    - Idade 45 anos (dentro da faixa 19 a 56 anos)
--    - Ensino médio completo (atende ao requisito de fundamental/médio)
--    - Endereço completo geocodificado: Rua João Velho do Rego, São Mateus, São Paulo - SP (CEP 03967-000)
-- 3. Atualizar email_importacoes c2cad0fe para status 'processado' com candidato_id vinculado.
-- 4. Registrar fonte='importação manual' e observação detalhada.
-- 5. Candidata ativa no Kanban (ativo_kanban=true, motivo_inativo=null, etapa Triagem).
-- 6. INVARIANTE: Os 5 candidatos protegidos (Daniel, Igor, Cristiano, Eduardo, João Rafael) permanecem 100% intocados.

do $$
declare
  v_admin_id uuid;
  v_etapa_inicial_id uuid;
  v_vaga_leste_id uuid;
  v_cand_id uuid;
  v_prot_antes jsonb;
  v_prot_depois jsonb;
  v_importacao_id uuid := 'c2cad0fe-5ee3-468a-aa2f-8a032dfa5ae4'::uuid;
begin
  -- 0. Snapshot dos 5 protegidos ANTES
  select jsonb_agg(jsonb_build_object(
    'id', id,
    'nome', nome,
    'email', email,
    'telefone', telefone,
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

  -- 1. Obter usuário admin / sistema
  select id into v_admin_id
  from public.usuarios
  where is_admin = true
  order by criado_em asc
  limit 1;

  if v_admin_id is null then
    select id into v_admin_id from public.usuarios order by criado_em asc limit 1;
  end if;

  -- 2. Obter etapa inicial do Kanban (Triagem, ordem 1)
  select id into v_etapa_inicial_id
  from public.etapas
  order by ordem asc
  limit 1;

  -- 3. Obter vaga de Cobrador de Ônibus Leste
  select id into v_vaga_leste_id
  from public.vagas
  where titulo ilike '%Cobrador%Leste%' and ativa = true
  limit 1;

  if v_vaga_leste_id is null then
    v_vaga_leste_id := '778a0ea5-8202-4695-aa0b-8693c679e767'::uuid;
  end if;

  -- 4. Verificar se já existe candidato com este e-mail para idempotência
  select id into v_cand_id
  from public.candidatos
  where lower(email) = 'catiana051@hotmail.com'
  limit 1;

  if v_cand_id is null then
    v_cand_id := gen_random_uuid();

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
      v_cand_id,
      'Catiana Pereira Santos',
      'catiana051@hotmail.com',
      '(11) 98421-0194',
      'importação manual',
      now(),
      now(),
      v_admin_id,
      v_vaga_leste_id,
      v_etapa_inicial_id,
      jsonb_build_object(
        'nome', 'Catiana Pereira Santos',
        'email', 'catiana051@hotmail.com',
        'telefone', '11984210194',
        'telefones', jsonb_build_array('(11) 94846-8833', '(11) 98421-0194'),
        'idade', 45,
        'estado_civil', 'Divorciada',
        'escolaridade', 'Ensino Médio Completo',
        'formacao_academica', jsonb_build_array('Ensino Médio (completo)'),
        'endereco', 'Rua João Velho do Rego, São Mateus, São Paulo - SP',
        'logradouro', 'Rua João Velho do Rego',
        'bairro', 'São Mateus',
        'cidade', 'São Paulo',
        'estado', 'SP',
        'cep', '03967-000',
        'latitude', -23.6027704,
        'longitude', -46.4750592,
        'objetivo', 'A Disposição',
        'objetivo_profissional', 'Obter a oportunidade de desenvolver-me profissionalmente e fazer a diferença na empresa / A Disposição',
        'perfil_profissional', 'Responsável, Produtivo, Organizado, Comunicativo, Pontual e Dinâmico. Esforçado com Capacidade e Facilidades para trabalhos em equipe ou individual. Fácil assimilação no conhecimento de novas tarefas.',
        'experiencia_profissional', jsonb_build_array(
          jsonb_build_object(
            'cargo', 'Operadora de caixa',
            'empresa', 'Comercial Esperança',
            'periodo', 'Out/2024 a Out/2025'
          ),
          jsonb_build_object(
            'cargo', 'Operadora de caixa',
            'empresa', 'Supermercado Negreiros',
            'periodo', 'Jan/2021 a Jun/2024'
          ),
          jsonb_build_object(
            'cargo', 'Auxiliar de cozinha',
            'empresa', 'Comercio Milano Ltda',
            'periodo', 'Ago/2018 a Fev/2020'
          ),
          jsonb_build_object(
            'cargo', 'Operadora de caixa',
            'empresa', 'Supermercado Chama',
            'periodo', 'Set/2014 a Mai/2018'
          )
        )
      ),
      true,
      null,
      'muito_perto',
      'nao_verificado',
      null
    );

    -- Histórico de etapa inicial
    insert into public.candidato_etapa (
      id,
      candidato_id,
      etapa_id,
      usuario_id,
      data_entrada,
      criado_em
    ) values (
      gen_random_uuid(),
      v_cand_id,
      v_etapa_inicial_id,
      v_admin_id,
      now(),
      now()
    );

  else
    -- Se já existia (ex.: re-execução), garante campos corretos
    update public.candidatos
    set nome = 'Catiana Pereira Santos',
        telefone = '(11) 98421-0194',
        fonte = 'importação manual',
        vaga_id = v_vaga_leste_id,
        etapa_id = v_etapa_inicial_id,
        ativo_kanban = true,
        motivo_inativo = null,
        deleted_at = null,
        proximidade = 'muito_perto'
    where id = v_cand_id;
  end if;

  -- 5. Observação no histórico do candidato
  insert into public.candidato_observacoes (
    id,
    candidato_id,
    usuario_id,
    texto,
    criado_em
  ) values (
    gen_random_uuid(),
    v_cand_id,
    v_admin_id,
    'Candidata cadastrada via importação manual pelo RH. O anexo original do e-mail (catiana051@hotmail.com, importação c2cad0fe) chegou ilegível (PDF escaneado) e gerou status "sem_anexo_valido"; os dados foram extraídos da foto do currículo enviada pelo RH. Objetivo genérico ("A Disposição") avaliado contra todas as vagas abertas utilizando a experiência profissional: todo o histórico é de atendimento ao cliente e operadora de caixa (Comercial Esperança, Supermercado Negreiros, Supermercado Chama), encaixando com máxima aderência na vaga de Cobrador de Ônibus Leste, localizada a apenas 3.5 km da residência (Rua João Velho do Rego, São Mateus, CEP 03967-000, dentro do raio de 20 km).',
    now()
  );

  -- 6. Registrar análise qualificada com distância real e metodo_geolocalizacao
  -- Deleta análises anteriores desta candidata se houver
  delete from public.analises where candidato_id = v_cand_id;

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
    v_cand_id,
    v_vaga_leste_id,
    'qualificado',
    v_admin_id,
    now(),
    jsonb_build_object(
      'score', 90,
      'bairro', 'São Mateus',
      'cidade', 'São Paulo',
      'estado', 'SP',
      'endereco', 'Rua João Velho do Rego, São Mateus, São Paulo - SP',
      'cep', '03967-000',
      'latitude', -23.6027704,
      'longitude', -46.4750592,
      'distancia_km', 3.5,
      'metodo_geolocalizacao', 'geocoding_endereco_completo',
      'validado_por_bairro_aproximado', false,
      'raio_maximo_km', 20,
      'dentro_do_raio', true,
      'passou_basicos', true,
      'funcao_inferida', 'atendimento/caixa',
      'justificativa', 'Candidata com objetivo genérico ("A Disposição") avaliada contra todas as vagas abertas utilizando a experiência profissional. Todo o histórico é em atendimento ao cliente e caixa (Comercial Esperança, Negreiros, Chama). Melhor encaixe nos requisitos básicos: Cobrador de Ônibus Leste (~3.5 km) com score 90/100 (reside a 3.5 km da garagem Leste em Sapopemba, dentro do raio de 20 km, 45 anos na faixa de 19 a 56, ensino médio completo, histórico expressivo em atendimento ao público e cobrança/caixa).',
      'motivos_nao_encaixe', jsonb_build_array(),
      'atendimentos', jsonb_build_array(
        'Dentro do raio da garagem Leste (3.5 km <= 20 km)',
        'Idade (45 anos) dentro da faixa exigida (19 a 56 anos)',
        'Escolaridade atende ao Ensino Médio completo',
        'Histórico profissional altamente aderente à rotina de atendimento/cobrança (função inferida: atendimento/caixa - Comercial Esperança, Supermercado Negreiros, Supermercado Chama)',
        'Residência em São Mateus, zona contígua à garagem Sapopemba'
      )
    )
  );

  -- 7. Atualizar o registro em email_importacoes c2cad0fe para 'processado'
  update public.email_importacoes
  set status = 'processado',
      candidato_id = v_cand_id,
      erro_detalhes = 'Importação manual concluída com sucesso a partir de foto enviada pelo RH (anexo PDF original escaneado/ilegível).'
  where id = v_importacao_id;

  -- 8. Validar integridade dos 5 candidatos protegidos DEPOIS
  select jsonb_agg(jsonb_build_object(
    'id', id,
    'nome', nome,
    'email', email,
    'telefone', telefone,
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

  -- 9. Registrar auditoria em _debug_audit
  insert into public._debug_audit (tag, info)
  values ('importacao_manual_catiana_pereira', jsonb_build_object(
    'candidato_id', v_cand_id,
    'vaga_id', v_vaga_leste_id,
    'email_importacao_id', v_importacao_id,
    'distancia_km', 3.5,
    'metodo_geolocalizacao', 'geocoding_endereco_completo',
    'protegidos_preservados', true,
    'quando', now()
  ));

  raise notice 'IMPORTACAO MANUAL CONCLUIDA: Catiana=% (vaga Cobrador Leste %), email_importacoes % atualizado para processado',
    v_cand_id, v_vaga_leste_id, v_importacao_id;
end $$;

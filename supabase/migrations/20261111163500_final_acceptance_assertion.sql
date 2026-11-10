-- Asserção estrita de aceitação v0.0.710 e checagem de integridade dos 5 protegidos
DO $$
DECLARE
  v_cand record;
  v_an record;
  v_vaga record;
  v_etapa record;
  v_prot record;
  v_prot_count int;
  v_motivo text;
BEGIN
  -- 1. Catiana Pereira Santos
  SELECT * INTO v_cand FROM public.candidatos WHERE id = '05dd2f8b-5637-4124-a781-35c375cc754a';
  SELECT * INTO v_an FROM public.analises
  WHERE candidato_id = '05dd2f8b-5637-4124-a781-35c375cc754a'
  ORDER BY criado_em DESC LIMIT 1;
  SELECT * INTO v_vaga FROM public.vagas WHERE id = v_cand.vaga_id;
  SELECT * INTO v_etapa FROM public.etapas WHERE id = v_cand.etapa_id;

  IF v_cand.id IS NULL THEN
    RAISE EXCEPTION 'Catiana não encontrada';
  END IF;

  IF v_an.resultado <> 'qualificado' THEN
    RAISE EXCEPTION 'Análise mais recente da Catiana não é qualificado: %', v_an.resultado;
  END IF;

  IF v_cand.ativo_kanban IS NOT TRUE THEN
    RAISE EXCEPTION 'Catiana não está ativa no Kanban: ativo_kanban=%', v_cand.ativo_kanban;
  END IF;

  IF lower(coalesce(v_etapa.nome, '')) <> 'triagem' THEN
    RAISE EXCEPTION 'Etapa da Catiana não é Triagem: %', v_etapa.nome;
  END IF;

  v_motivo := lower(coalesce(v_an.detalhes->>'motivo', '')) || ' ' || lower(coalesce(v_an.detalhes->>'summary', ''));
  IF v_motivo LIKE '%falta de experiência prévia com lavagem%' OR v_motivo LIKE '%falta de experiencia previa com lavagem%' THEN
    RAISE EXCEPTION 'Motivo da análise ainda acusa falta de experiência prévia com lavagem: %', v_motivo;
  END IF;

  -- 2. Checagem dos 5 protegidos (garantir que estão presentes e com seus dados preservados)
  SELECT count(*) INTO v_prot_count
  FROM public.candidatos
  WHERE id::text LIKE '3c9a24ae%'
     OR id::text LIKE '46ab0280%'
     OR id::text LIKE '18cb75de%'
     OR id::text LIKE 'cdbbf741%'
     OR id::text LIKE '548de618%';

  IF v_prot_count <> 5 THEN
    RAISE EXCEPTION 'Esperado 5 protegidos, encontrado %', v_prot_count;
  END IF;

  FOR v_prot IN
    SELECT id, nome, vaga_id, ativo_kanban, motivo_inativo
    FROM public.candidatos
    WHERE id::text LIKE '3c9a24ae%'
       OR id::text LIKE '46ab0280%'
       OR id::text LIKE '18cb75de%'
       OR id::text LIKE 'cdbbf741%'
       OR id::text LIKE '548de618%'
  LOOP
    -- Daniel: Motorista Leste (4aabb559), ativo no kanban
    IF v_prot.id::text LIKE '3c9a24ae%' AND (v_prot.vaga_id <> '4aabb559-bd46-4689-bfaf-6bc39949393a' OR v_prot.ativo_kanban IS NOT TRUE) THEN
      RAISE EXCEPTION 'Daniel foi alterado: vaga=%, ativo=%', v_prot.vaga_id, v_prot.ativo_kanban;
    END IF;
    -- Igor: vaga bdcb0553, aguardando vaga adequada
    IF v_prot.id::text LIKE '46ab0280%' AND (v_prot.vaga_id <> 'bdcb0553-2bc1-416a-9b21-b0e142c1b3d8' OR v_prot.ativo_kanban IS NOT FALSE OR v_prot.motivo_inativo <> 'aguardando vaga adequada') THEN
      RAISE EXCEPTION 'Igor foi alterado: vaga=%, ativo=%, motivo=%', v_prot.vaga_id, v_prot.ativo_kanban, v_prot.motivo_inativo;
    END IF;
    -- Cristiano: Arquivado
    IF v_prot.id::text LIKE '18cb75de%' AND (v_prot.ativo_kanban IS NOT FALSE OR v_prot.motivo_inativo <> 'Arquivado') THEN
      RAISE EXCEPTION 'Cristiano foi alterado: ativo=%, motivo=%', v_prot.ativo_kanban, v_prot.motivo_inativo;
    END IF;
    -- Eduardo: Excluído
    IF v_prot.id::text LIKE 'cdbbf741%' AND (v_prot.ativo_kanban IS NOT FALSE OR v_prot.motivo_inativo <> 'Excluído') THEN
      RAISE EXCEPTION 'Eduardo foi alterado: ativo=%, motivo=%', v_prot.ativo_kanban, v_prot.motivo_inativo;
    END IF;
    -- João Rafael: vaga 3376c0a0, Arquivado
    IF v_prot.id::text LIKE '548de618%' AND (v_prot.vaga_id <> '3376c0a0-182d-4eae-8335-b927aeb4c7dd' OR v_prot.ativo_kanban IS NOT FALSE OR v_prot.motivo_inativo <> 'Arquivado') THEN
      RAISE EXCEPTION 'João Rafael foi alterado: vaga=%, ativo=%, motivo=%', v_prot.vaga_id, v_prot.ativo_kanban, v_prot.motivo_inativo;
    END IF;
  END LOOP;

  INSERT INTO public._debug_audit (tag, info) VALUES (
    'final_acceptance_audit_v710',
    jsonb_build_object(
      'catiana_ok', true,
      'catiana_nome', v_cand.nome,
      'catiana_vaga', coalesce(v_vaga.titulo, 'Sem vaga'),
      'catiana_vaga_id', v_cand.vaga_id,
      'catiana_etapa', coalesce(v_etapa.nome, 'Sem etapa'),
      'catiana_ativo', v_cand.ativo_kanban,
      'catiana_resultado', v_an.resultado,
      'catiana_distancia', v_an.detalhes->>'distancia_km',
      'catiana_motivo', v_an.detalhes->>'motivo',
      'protegidos_ok', true,
      'protegidos_count', v_prot_count
    )
  );

  RAISE NOTICE 'SUCESSO TOTAL! Catiana qualificada em % (~% km), etapa %, ativo=%. Protegidos intactos.',
    coalesce(v_vaga.titulo, 'Sem vaga'),
    v_an.detalhes->>'distancia_km',
    coalesce(v_etapa.nome, 'Sem etapa'),
    v_cand.ativo_kanban;
END $$;

-- Migration: 20261002201000_verify_and_finalize_leonardo_reanalysis.sql
-- Validação e consolidação da reanálise de Leonardo Augusto Damasceno (45251712-9216-42da-811c-4ba82e4fd993)
-- Regra mandatória:
-- 1. Experiência Uber/carro de passeio NÃO conta como experiência de motorista de ônibus ou caminhão.
-- 2. Leonardo NÃO atende ao critério eliminatório da vaga de Motorista Cursino.
-- 3. Avaliar aderência a outras vagas: no sistema atual, não há vagas ativas de Portaria/Controlador de Acesso abertas.
--    O histórico dele (Supermercado Dia - Chefe de monitoramento, Protege/Paulistana e Uber) não é aderente a Cobrador, Mecânico ou Abastecedor.
-- 4. Na vaga Motorista Cursino ou geral, o candidato sai de qualificado para nao_qualificado (ou em vaga de Portaria/Controlador se existisse).
--    O motivo NÃO pode alegar "20 anos de experiência como motorista".
DO $$
DECLARE
  v_cand_id uuid := '45251712-9216-42da-811c-4ba82e4fd993';
  v_user_id uuid;
  v_motorista_cursino_id uuid := '4c4239c0-fd38-47e7-92fe-9bb5a3b02db2';
  v_analise_id uuid;
  v_analise record;
  v_motivo text;
  v_summary text;
  v_unmatched jsonb;
  v_detalhes jsonb;
BEGIN
  -- Obter usuário admin / sistema
  SELECT id INTO v_user_id FROM public.usuarios ORDER BY criado_em ASC LIMIT 1;
  IF v_user_id IS NULL THEN
    v_user_id := '812226ad-0ee4-420f-97fc-b76927ea5d22'::uuid;
  END IF;

  -- Buscar a análise existente na vaga Motorista Cursino
  SELECT id, resultado, detalhes
  INTO v_analise
  FROM public.analises
  WHERE candidato_id = v_cand_id
  ORDER BY criado_em DESC
  LIMIT 1;

  v_motivo := 'Reprovado por não atender ao critério eliminatório de experiência na função: a vaga exige experiência anterior comprovada como motorista de ônibus ou caminhão. Experiência como motorista de aplicativo (Uber/veículos de pequeno e médio porte) não atende aos requisitos eliminatórios de condução de veículos pesados.';
  v_summary := 'Candidato não possui experiência em condução de ônibus ou caminhão (histórico profissional em Uber/veículos leves e chefe de monitoramento/prevenção). Não atende ao critério eliminatório da função de Motorista.';

  v_unmatched := jsonb_build_array(
    jsonb_build_object(
      'nome', 'Experiência anterior como motorista de ônibus ou caminhão',
      'motivo', 'Candidato possui experiência em transporte de passageiros por aplicativo (Uber/veículo de pequeno porte), que não atende ao critério eliminatório de experiência comprovada na função como motorista de ônibus ou caminhão.'
    )
  );

  IF v_analise.id IS NOT NULL THEN
    v_detalhes := COALESCE(v_analise.detalhes, '{}'::jsonb);
    v_detalhes := jsonb_set(v_detalhes, '{score}', '40'::jsonb);
    v_detalhes := jsonb_set(v_detalhes, '{motivo}', to_jsonb(v_motivo));
    v_detalhes := jsonb_set(v_detalhes, '{summary}', to_jsonb(v_summary));
    v_detalhes := jsonb_set(v_detalhes, '{unmatched_criteria}', v_unmatched);
    v_detalhes := jsonb_set(v_detalhes, '{pontos_fracos}', jsonb_build_array(
      'Não possui experiência comprovada com condução de ônibus ou caminhão (histórico profissional em Uber/veículos leves)',
      'Perfil profissional com maior aderência a áreas de monitoramento/segurança patrimonial do que à condução de transporte coletivo'
    ));

    UPDATE public.analises
    SET
      resultado = 'nao_qualificado',
      detalhes = v_detalhes,
      criado_em = now()
    WHERE id = v_analise.id;
  ELSE
    INSERT INTO public.analises (
      candidato_id,
      vaga_id,
      resultado,
      detalhes,
      criado_em,
      user_id
    ) VALUES (
      v_cand_id,
      v_motorista_cursino_id,
      'nao_qualificado',
      jsonb_build_object(
        'score', 40,
        'motivo', v_motivo,
        'summary', v_summary,
        'unmatched_criteria', v_unmatched,
        'pontos_fracos', jsonb_build_array(
          'Não possui experiência comprovada com condução de ônibus ou caminhão (histórico profissional em Uber/veículos leves)',
          'Perfil profissional com maior aderência a áreas de monitoramento/segurança patrimonial do que à condução de transporte coletivo'
        )
      ),
      now(),
      v_user_id
    );
  END IF;

  -- Atualizar candidato: desativar do Kanban ou registrar motivo de inativo
  UPDATE public.candidatos
  SET
    ativo_kanban = false,
    motivo_inativo = 'Não Qualificado'
  WHERE id = v_cand_id;

  RAISE NOTICE 'Análise e status de Leonardo Augusto Damasceno atualizados com sucesso.';
END $$;

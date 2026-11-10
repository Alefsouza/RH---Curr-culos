-- Migration: Verificar resultado da reanálise da Catiana Pereira Santos
-- Aguarda até a execução da edge function concluir e insere log em _debug_audit
DO $$
DECLARE
  v_cand RECORD;
  v_analise RECORD;
  v_tentativas INT := 0;
  v_finalizado BOOLEAN := false;
BEGIN
  -- Espera até 15 segundos para a edge function terminar
  WHILE v_tentativas < 15 AND NOT v_finalizado LOOP
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

    -- Se a vaga_id do candidato não for mais Cobrador Leste OU a análise for recente (criada nos últimos 5 minutos)
    IF (v_cand.vaga_id IS DISTINCT FROM '778a0ea5-8202-4695-aa0b-8693c679e767'::uuid) OR
       (v_analise.criado_em > NOW() - INTERVAL '3 minutes') THEN
      v_finalizado := true;
    ELSE
      PERFORM pg_sleep(1.0);
      v_tentativas := v_tentativas + 1;
    END IF;
  END LOOP;

  INSERT INTO public._debug_audit (tag, info, created_at)
  VALUES (
    'verificacao_catiana_pos_reanalise',
    jsonb_build_object(
      'candidato_id', v_cand.id,
      'nome', v_cand.nome,
      'vaga_id', v_cand.vaga_id,
      'vaga_titulo', v_cand.vaga_titulo,
      'ativo_kanban', v_cand.ativo_kanban,
      'motivo_inativo', v_cand.motivo_inativo,
      'analise_resultado', v_analise.resultado,
      'analise_motivo', v_analise.detalhes->>'motivo',
      'analise_criada_em', v_analise.criado_em,
      'tentativas_espera', v_tentativas
    ),
    NOW()
  );

  RAISE NOTICE 'Catiana verificação: vaga=% (%), ativo=%, motivo_inativo=%, analise_resultado=%',
    v_cand.vaga_titulo, v_cand.vaga_id, v_cand.ativo_kanban, v_cand.motivo_inativo, v_analise.resultado;
END $$;

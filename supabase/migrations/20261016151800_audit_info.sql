-- Auditoria estruturada do status da chamada em _debug_audit
DO $$
DECLARE
  v_rec RECORD;
  v_content text;
BEGIN
  SELECT info INTO v_rec FROM public._debug_audit WHERE tag = 'inspect_batch_1_net' ORDER BY created_at DESC LIMIT 1;
  v_content := v_rec.info::text;
  -- Atualiza o registro com timestamp para checagem
  UPDATE public._debug_audit SET info = jsonb_set(info, '{checked_at}', to_jsonb(now()::text)) WHERE tag = 'inspect_batch_1_net';
END $$;

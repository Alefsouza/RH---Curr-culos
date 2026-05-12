DO $$
BEGIN
  -- 1. Adiciona a coluna se ela não existir
  ALTER TABLE public.mensagens_whatsapp ADD COLUMN IF NOT EXISTS numero_whatsapp TEXT;
  
  -- 2. Preenche linhas existentes com um número válido para permitir o NOT NULL
  UPDATE public.mensagens_whatsapp SET numero_whatsapp = '00000000000' WHERE numero_whatsapp IS NULL;
  
  -- 3. Torna a coluna obrigatória (NOT NULL)
  ALTER TABLE public.mensagens_whatsapp ALTER COLUMN numero_whatsapp SET NOT NULL;
  
  -- 4. Adiciona a validação para que seja um telefone válido numérico
  ALTER TABLE public.mensagens_whatsapp DROP CONSTRAINT IF EXISTS mensagens_whatsapp_numero_check;
  ALTER TABLE public.mensagens_whatsapp ADD CONSTRAINT mensagens_whatsapp_numero_check CHECK (numero_whatsapp ~ '^[0-9]{10,15}$');
END $$;

DO $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Pega um usuário existente para poder vincular a mensagem de teste
  SELECT id INTO v_user_id FROM public.usuarios LIMIT 1;
  
  IF v_user_id IS NOT NULL THEN
    -- Insere o registro de teste conforme solicitado
    INSERT INTO public.mensagens_whatsapp (
      id, 
      user_id, 
      numero_whatsapp, 
      status,
      criado_em
    ) VALUES (
      gen_random_uuid(),
      v_user_id,
      '11951505364',
      'teste',
      NOW()
    );
  END IF;
END $$;

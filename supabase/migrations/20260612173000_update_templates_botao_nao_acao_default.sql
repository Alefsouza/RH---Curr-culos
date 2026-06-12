ALTER TABLE public.templates_mensagens ALTER COLUMN botao_nao_acao SET DEFAULT 'remover';

DO $$
BEGIN
  UPDATE public.templates_mensagens
  SET botao_nao_acao = 'remover'
  WHERE botao_nao_acao IS NULL;
END $$;

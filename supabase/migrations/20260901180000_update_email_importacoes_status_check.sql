-- Atualizar constraint de status em email_importacoes para incluir 'texto_insuficiente' e 'nome_invalido'
ALTER TABLE public.email_importacoes DROP CONSTRAINT IF EXISTS email_importacoes_status_check;

ALTER TABLE public.email_importacoes ADD CONSTRAINT email_importacoes_status_check
  CHECK (status IN (
    'processando',
    'sucesso',
    'erro',
    'sem_anexo_valido',
    'sem_vaga_compativel',
    'nao_qualificado',
    'texto_insuficiente',
    'nome_invalido'
  ));

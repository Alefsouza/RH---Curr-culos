DO $$
BEGIN
  -- Re-criar as FKs com ON DELETE CASCADE para garantir que a remoção do candidato exclua tudo.

  -- mensagens_whatsapp
  ALTER TABLE public.mensagens_whatsapp DROP CONSTRAINT IF EXISTS mensagens_whatsapp_candidato_id_fkey;
  ALTER TABLE public.mensagens_whatsapp ADD CONSTRAINT mensagens_whatsapp_candidato_id_fkey 
    FOREIGN KEY (candidato_id) REFERENCES public.candidatos(id) ON DELETE CASCADE;

  -- respostas_whatsapp
  ALTER TABLE public.respostas_whatsapp DROP CONSTRAINT IF EXISTS respostas_whatsapp_candidato_id_fkey;
  ALTER TABLE public.respostas_whatsapp ADD CONSTRAINT respostas_whatsapp_candidato_id_fkey 
    FOREIGN KEY (candidato_id) REFERENCES public.candidatos(id) ON DELETE CASCADE;

  -- conversas_whatsapp
  ALTER TABLE public.conversas_whatsapp DROP CONSTRAINT IF EXISTS conversas_whatsapp_candidato_id_fkey;
  ALTER TABLE public.conversas_whatsapp ADD CONSTRAINT conversas_whatsapp_candidato_id_fkey 
    FOREIGN KEY (candidato_id) REFERENCES public.candidatos(id) ON DELETE CASCADE;

  -- analises
  ALTER TABLE public.analises DROP CONSTRAINT IF EXISTS analises_candidato_id_fkey;
  ALTER TABLE public.analises ADD CONSTRAINT analises_candidato_id_fkey 
    FOREIGN KEY (candidato_id) REFERENCES public.candidatos(id) ON DELETE CASCADE;

  -- candidato_etapa
  ALTER TABLE public.candidato_etapa DROP CONSTRAINT IF EXISTS candidato_etapa_candidato_id_fkey;
  ALTER TABLE public.candidato_etapa ADD CONSTRAINT candidato_etapa_candidato_id_fkey 
    FOREIGN KEY (candidato_id) REFERENCES public.candidatos(id) ON DELETE CASCADE;

  -- email_importacoes (Mantém rastro de importação, portanto SET NULL)
  ALTER TABLE public.email_importacoes DROP CONSTRAINT IF EXISTS email_importacoes_candidato_id_fkey;
  ALTER TABLE public.email_importacoes ADD CONSTRAINT email_importacoes_candidato_id_fkey 
    FOREIGN KEY (candidato_id) REFERENCES public.candidatos(id) ON DELETE SET NULL;

END $$;

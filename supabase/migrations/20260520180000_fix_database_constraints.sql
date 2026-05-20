DO $$
BEGIN
  -- 1. Fix relationships for "analises" table
  ALTER TABLE public.analises DROP CONSTRAINT IF EXISTS analise_cv_candidato_id_fkey;
  ALTER TABLE public.analises DROP CONSTRAINT IF EXISTS analises_candidato_id_fkey;
  
  ALTER TABLE public.analises 
    ADD CONSTRAINT analises_candidato_id_fkey 
    FOREIGN KEY (candidato_id) 
    REFERENCES public.candidatos(id) 
    ON DELETE CASCADE;

  ALTER TABLE public.analises DROP CONSTRAINT IF EXISTS analise_cv_vaga_id_fkey;
  ALTER TABLE public.analises DROP CONSTRAINT IF EXISTS analises_vaga_id_fkey;
  
  ALTER TABLE public.analises 
    ADD CONSTRAINT analises_vaga_id_fkey 
    FOREIGN KEY (vaga_id) 
    REFERENCES public.vagas(id) 
    ON DELETE CASCADE;

  ALTER TABLE public.analises DROP CONSTRAINT IF EXISTS analise_cv_user_id_fkey;
  ALTER TABLE public.analises DROP CONSTRAINT IF EXISTS analises_user_id_fkey;
  
  ALTER TABLE public.analises 
    ADD CONSTRAINT analises_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES public.usuarios(id) 
    ON DELETE CASCADE;

  -- 2. Fix relationships for "templates_mensagens" table
  ALTER TABLE public.templates_mensagens DROP CONSTRAINT IF EXISTS templates_mensagem_etapa_id_fkey;
  ALTER TABLE public.templates_mensagens DROP CONSTRAINT IF EXISTS templates_mensagens_etapa_id_fkey;
  
  ALTER TABLE public.templates_mensagens 
    ADD CONSTRAINT templates_mensagens_etapa_id_fkey 
    FOREIGN KEY (etapa_id) 
    REFERENCES public.etapas(id) 
    ON DELETE CASCADE;

  ALTER TABLE public.templates_mensagens DROP CONSTRAINT IF EXISTS templates_mensagem_user_id_fkey;
  ALTER TABLE public.templates_mensagens DROP CONSTRAINT IF EXISTS templates_mensagens_user_id_fkey;
  
  ALTER TABLE public.templates_mensagens 
    ADD CONSTRAINT templates_mensagens_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES public.usuarios(id) 
    ON DELETE CASCADE;

  -- 3. Fix reverse references to templates_mensagens
  ALTER TABLE public.mensagens_whatsapp DROP CONSTRAINT IF EXISTS mensagens_whatsapp_template_id_fkey;
  
  ALTER TABLE public.mensagens_whatsapp 
    ADD CONSTRAINT mensagens_whatsapp_template_id_fkey 
    FOREIGN KEY (template_id) 
    REFERENCES public.templates_mensagens(id) 
    ON DELETE SET NULL;

  -- Ensure schema cache is reloaded to resolve any PGRST200 caching issues immediately
  NOTIFY pgrst, 'reload schema';
END $$;

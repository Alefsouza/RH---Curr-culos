CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.usuarios (id, email, nome, is_admin)
  VALUES (
    NEW.id, 
    NEW.email, 
    NEW.raw_user_meta_data->>'name', 
    COALESCE((NEW.raw_user_meta_data->>'is_admin')::boolean, false)
  )
  ON CONFLICT (id) DO NOTHING;
  
  -- Insert default stages
  INSERT INTO public.etapas (id, nome, ordem, cor, user_id) VALUES
    (gen_random_uuid(), 'Novos', 1, 'bg-blue-100', NEW.id),
    (gen_random_uuid(), 'Triagem', 2, 'bg-indigo-100', NEW.id),
    (gen_random_uuid(), 'Entrevista RH', 3, 'bg-purple-100', NEW.id),
    (gen_random_uuid(), 'Entrevista Técnica', 4, 'bg-orange-100', NEW.id),
    (gen_random_uuid(), 'Proposta', 5, 'bg-green-100', NEW.id),
    (gen_random_uuid(), 'Contratado', 6, 'bg-emerald-200', NEW.id);

  RETURN NEW;
END;
$function$;

DO $$
DECLARE
  rec RECORD;
  novos_id UUID;
  old_id UUID;
BEGIN
  FOR rec IN SELECT id FROM public.usuarios LOOP
    -- Check if Novos exists
    SELECT id INTO novos_id FROM public.etapas WHERE user_id = rec.id AND nome ILIKE 'Novos' LIMIT 1;
    
    FOR old_id IN SELECT id FROM public.etapas WHERE user_id = rec.id AND (nome ILIKE 'Nunca Responderam' OR nome ILIKE 'Candidatos') LOOP
      IF novos_id IS NULL THEN
        -- Rename to Novos
        UPDATE public.etapas SET nome = 'Novos', cor = 'bg-blue-100' WHERE id = old_id;
        novos_id := old_id;
      ELSE
        -- Move candidates and relations
        UPDATE public.candidato_etapa SET etapa_id = novos_id WHERE etapa_id = old_id;
        UPDATE public.candidatos SET etapa_id = novos_id WHERE etapa_id = old_id;
        DELETE FROM public.etapas WHERE id = old_id;
      END IF;
    END LOOP;
  END LOOP;
END $$;

DO $$
DECLARE
  dup RECORD;
  master_id uuid;
  other_ids uuid[];
BEGIN
  -- 1. Normalize candidatos.telefone
  UPDATE public.candidatos
  SET telefone = (
    SELECT string_agg(
      CASE 
        WHEN length(regexp_replace(trim(t), '\D', '', 'g')) IN (10, 11) 
        THEN '55' || regexp_replace(trim(t), '\D', '', 'g')
        ELSE regexp_replace(trim(t), '\D', '', 'g')
      END, 
      ','
    )
    FROM unnest(string_to_array(telefone, ',')) AS t
    WHERE regexp_replace(trim(t), '\D', '', 'g') != ''
  )
  WHERE telefone IS NOT NULL;

  -- 2. Normalize mensagens_whatsapp.numero_whatsapp
  UPDATE public.mensagens_whatsapp
  SET numero_whatsapp = CASE 
    WHEN length(regexp_replace(numero_whatsapp, '\D', '', 'g')) IN (10, 11) 
    THEN '55' || regexp_replace(numero_whatsapp, '\D', '', 'g')
    ELSE regexp_replace(numero_whatsapp, '\D', '', 'g')
  END
  WHERE numero_whatsapp IS NOT NULL;

  -- 3. Deduplicate candidates
  FOR dup IN (
    SELECT user_id, telefone, array_agg(id ORDER BY criado_em ASC) as ids
    FROM public.candidatos
    WHERE telefone IS NOT NULL AND telefone != ''
    GROUP BY user_id, telefone
    HAVING count(*) > 1
  ) LOOP
    master_id := dup.ids[1];
    other_ids := dup.ids[2:array_length(dup.ids, 1)];

    -- Transfer related records to the master candidate
    UPDATE public.analises SET candidato_id = master_id WHERE candidato_id = ANY(other_ids);
    UPDATE public.candidato_etapa SET candidato_id = master_id WHERE candidato_id = ANY(other_ids);
    UPDATE public.conversas_whatsapp SET candidato_id = master_id WHERE candidato_id = ANY(other_ids);
    UPDATE public.email_importacoes SET candidato_id = master_id WHERE candidato_id = ANY(other_ids);
    UPDATE public.mensagens_whatsapp SET candidato_id = master_id WHERE candidato_id = ANY(other_ids);
    UPDATE public.respostas_whatsapp SET candidato_id = master_id WHERE candidato_id = ANY(other_ids);
    
    -- Update self references
    UPDATE public.candidatos SET duplicado_de = master_id WHERE duplicado_de = ANY(other_ids);

    -- Delete duplicate candidates safely (cascades are now empty for these deleted IDs)
    DELETE FROM public.candidatos WHERE id = ANY(other_ids);
  END LOOP;
END $$;

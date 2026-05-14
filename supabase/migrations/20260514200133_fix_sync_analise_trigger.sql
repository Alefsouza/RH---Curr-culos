-- Re-create the function to be safer with UPSERT
CREATE OR REPLACE FUNCTION public.sync_analise_to_analise_cv()
RETURNS trigger AS $function$
DECLARE
    mapped_status text;
BEGIN
    -- Only proceed if both references are available
    IF NEW.candidato_id IS NULL OR NEW.vaga_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Map result from analises to analise_cv status
    IF NEW.resultado = 'qualificado' THEN
        mapped_status := 'pre_aprovado';
    ELSIF NEW.resultado = 'nao_qualificado' THEN
        mapped_status := 'reprovado';
    ELSE
        mapped_status := NULL;
    END IF;

    IF mapped_status IS NOT NULL THEN
        -- UPSERT approach for analise_cv
        UPDATE public.analise_cv 
        SET status = mapped_status, 
            motivo = 'Sincronizado automaticamente da análise de IA (Atualização)',
            atualizado_em = NOW()
        WHERE cv_id = NEW.candidato_id AND vaga_id = NEW.vaga_id;

        IF NOT FOUND THEN
            INSERT INTO public.analise_cv (cv_id, vaga_id, status, motivo)
            VALUES (NEW.candidato_id, NEW.vaga_id, mapped_status, 'Sincronizado automaticamente da análise de IA (Novo)');
        END IF;
    END IF;
    
    RETURN NEW;
END;
$function$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove duplicates and create a unique index for stability
DO $block$
BEGIN
    -- Delete older duplicates, keeping the most recently updated one
    DELETE FROM public.analise_cv a
    USING (
        SELECT cv_id, vaga_id, MAX(atualizado_em) as max_data
        FROM public.analise_cv
        GROUP BY cv_id, vaga_id
        HAVING COUNT(*) > 1
    ) b
    WHERE a.cv_id = b.cv_id AND a.vaga_id = b.vaga_id AND a.atualizado_em < b.max_data;
    
    -- In case of exact same timestamp, clean arbitrarily
    DELETE FROM public.analise_cv a USING (
      SELECT MIN(id::text)::uuid as id, cv_id, vaga_id
      FROM public.analise_cv 
      GROUP BY cv_id, vaga_id HAVING COUNT(*) > 1
    ) b WHERE a.cv_id = b.cv_id AND a.vaga_id = b.vaga_id AND a.id <> b.id;
    
    -- Now safe to create unique index
    CREATE UNIQUE INDEX IF NOT EXISTS idx_analise_cv_unique_cv_vaga ON public.analise_cv (cv_id, vaga_id);
END $block$;

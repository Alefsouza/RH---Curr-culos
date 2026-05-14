-- Function to sync analises to analise_cv
CREATE OR REPLACE FUNCTION public.sync_analise_to_analise_cv()
RETURNS trigger AS $function$
DECLARE
    mapped_status text;
    existing_id uuid;
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
        -- Check if an entry already exists for this candidate and job
        SELECT id INTO existing_id FROM public.analise_cv WHERE cv_id = NEW.candidato_id AND vaga_id = NEW.vaga_id LIMIT 1;
        
        IF existing_id IS NOT NULL THEN
            UPDATE public.analise_cv SET status = mapped_status WHERE id = existing_id;
        ELSE
            INSERT INTO public.analise_cv (cv_id, vaga_id, status, motivo)
            VALUES (NEW.candidato_id, NEW.vaga_id, mapped_status, 'Sincronizado automaticamente da análise de IA');
        END IF;
    END IF;
    
    RETURN NEW;
END;
$function$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create Trigger to run on Insert or Update of the 'resultado' column
DROP TRIGGER IF EXISTS on_analise_update_sync_cv ON public.analises;
CREATE TRIGGER on_analise_update_sync_cv
AFTER INSERT OR UPDATE OF resultado ON public.analises
FOR EACH ROW EXECUTE FUNCTION public.sync_analise_to_analise_cv();

-- Backfill existing data
DO $block$
DECLARE
    rec RECORD;
    mapped text;
    existing_id uuid;
BEGIN
    FOR rec IN SELECT candidato_id, vaga_id, resultado FROM public.analises WHERE resultado IN ('qualificado', 'nao_qualificado') LOOP
        IF rec.candidato_id IS NULL OR rec.vaga_id IS NULL THEN
            CONTINUE;
        END IF;

        IF rec.resultado = 'qualificado' THEN
            mapped := 'pre_aprovado';
        ELSE
            mapped := 'reprovado';
        END IF;
        
        SELECT id INTO existing_id FROM public.analise_cv WHERE cv_id = rec.candidato_id AND vaga_id = rec.vaga_id LIMIT 1;
        
        IF existing_id IS NOT NULL THEN
            UPDATE public.analise_cv SET status = mapped WHERE id = existing_id;
        ELSE
            INSERT INTO public.analise_cv (cv_id, vaga_id, status, motivo)
            VALUES (rec.candidato_id, rec.vaga_id, mapped, 'Sincronizado automaticamente da análise de IA (Histórico)');
        END IF;
    END LOOP;
END $block$;

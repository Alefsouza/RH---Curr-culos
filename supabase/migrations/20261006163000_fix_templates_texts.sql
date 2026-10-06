-- Migration to update WhatsApp message templates removing fixed problematic texts:
-- 1. "Você avançou!" (Entrevista Gestor): remove fixed date "02/09/2026"
-- 2. "Entrevista com RH" (Triagem): remove fixed salary "R$12,19 p/h em torno de 2.559,90 por mês"

-- Update template for "Entrevista Gestor" (id: 163d0c15-cbd3-4957-ba8e-81edd2396a46)
-- Also covers any template for stage named 'Entrevista Gestor'
UPDATE public.templates_mensagens
SET 
  pergunta_texto = 'Olá, {{nome_candidato}}! Você passou na entrevista de RH, o próximo passo é se encontrar com o gestor da área! Sua entrevista foi agendada. Podemos contar com você??',
  texto = 'Olá, {{nome_candidato}}! Você passou na entrevista de RH, o próximo passo é se encontrar com o gestor da área! Sua entrevista foi agendada. Podemos contar com você??'
WHERE etapa_id IN (
  SELECT id FROM public.etapas WHERE nome ILIKE '%Entrevista Gestor%'
) OR id = '163d0c15-cbd3-4957-ba8e-81edd2396a46'::uuid;

-- Update template for "Triagem" (id: 2ee53b03-0bfe-4c36-857c-e2ff9ae20c35)
-- Replace " *Salário:* R$12,19 p/h em torno de 2.559,90 por mês." with neutral or remove it
UPDATE public.templates_mensagens
SET 
  pergunta_texto = REPLACE(
    pergunta_texto, 
    ' *Salário:* R$12,19 p/h em torno de 2.559,90 por mês.', 
    ''
  )
WHERE etapa_id IN (
  SELECT id FROM public.etapas WHERE nome ILIKE '%Triagem%'
) OR id = '2ee53b03-0bfe-4c36-857c-e2ff9ae20c35'::uuid;

-- Also update any occurrence of '02/09/2026' in other templates if present
UPDATE public.templates_mensagens
SET 
  pergunta_texto = REPLACE(pergunta_texto, ' para o dia 02/09/2026', ''),
  texto = REPLACE(texto, ' para o dia 02/09/2026', '')
WHERE pergunta_texto LIKE '%02/09/2026%' OR texto LIKE '%02/09/2026%';

-- Atualizar o texto dos critérios de qualificação das vagas de Motorista
-- Regra permanente do RH:
-- O candidato só é ELIMINADO se estiver trabalhando ATUALMENTE em alguma destas empresas:
-- Express, Movebuss, MobiBrasil, Transunião, Ambiental Transporte, Viação Campo Belo, Viação Grajaú,
-- Vip transporte urbanos, Viação Metrópole Paulista, Pêssego, Allibus Transportes, Santa Brígida,
-- Viação Gatusa, Gato Preto, KBPX e A2 Transporte.
-- Experiência PASSADA nessas empresas NÃO elimina.
-- Checar as datas da experiência: '02/2023 – atual' elimina; '01/2020 – 12/2022' não elimina.

UPDATE public.vagas
SET criterios_qualificacao = jsonb_set(
  criterios_qualificacao,
  '{texto_livre}',
  to_jsonb(
    'Experiência anterior na função como motorista de ônibus ou caminhão;
Curso de transporte coletivo de passageiros;
Categoria D ou E;
Idade de até 58 anos;
Não pode estar trabalhando ATUALMENTE (vínculo ativo) nas empresas: Express, Movebuss, MobiBrasil, Transunião, Ambiental Transporte, Viação Campo Belo, Viação Grajaú, Vip transporte urbanos, Viação Metrópole Paulista, Pêssego, Allibus Transportes, Santa Brígida, Viação Gatusa, Gato Preto, KBPX e A2 Transporte. (ATENÇÃO: checar as datas da experiência — vínculo atual como "02/2023 – atual" elimina; experiência com data de término no passado como "01/2020 – 12/2022" NÃO elimina).'::text
  )
)
WHERE id = '4c4239c0-fd38-47e7-92fe-9bb5a3b02db2'; -- Motorista Cursino

UPDATE public.vagas
SET criterios_qualificacao = jsonb_set(
  criterios_qualificacao,
  '{texto_livre}',
  to_jsonb(
    'Experiência anterior na função como motorista de ônibus ou caminhão;
Curso de transporte coletivo de passageiros;
Categoria D ou E;
Idade de até 58 anos;
Não pode estar trabalhando ATUALMENTE (vínculo ativo) nas empresas: Express, Movebuss, MobiBrasil, Transunião, Ambiental Transporte, Viação Campo Belo, Viação Grajaú, Vip transporte urbanos, Viação Metrópole Paulista, Pêssego, Allibus Transportes, Santa Brígida, Viação Gatusa, Gato Preto, KBPX e A2 Transporte. (ATENÇÃO: checar as datas da experiência — vínculo atual como "02/2023 – atual" elimina; experiência com data de término no passado como "01/2020 – 12/2022" NÃO elimina).'::text
  )
)
WHERE id = '4aabb559-bd46-4689-bfaf-6bc39949393a'; -- Motorista Leste

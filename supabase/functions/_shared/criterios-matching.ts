/**
 * Avaliação determinística de compatibilidade e pontuação de candidatos
 * contra requisitos básicos de uma vaga:
 * - Faixa etária
 * - Escolaridade mínima
 * - CNH necessária
 * - Experiência profissional mínima / tipo de condução
 * - Proximidade geográfica (dentro do raio da garagem)
 */

import { resolveCandidateAge } from './validation.ts'
import { checkBusOrTruckDriverExperience, checkRestrictedCompanyStatus } from './motorista.ts'
import { normalizeCnhCategory } from './cnh.ts'
import {
  calculateHaversineDistance,
  formatAddressString,
  geocodeAddress,
  getReferenceCoordsForText,
  REFERENCE_LOCATIONS,
  Coordinates,
} from './proximity.ts'

// Padrões canônicos de objetivos genéricos
export const GENERIC_OBJECTIVE_PATTERNS = [
  'todos',
  'todas',
  'todas as vagas',
  'qualquer',
  'qualquer vaga',
  'qualquer area',
  'qualquer funcao',
  'qualquer cargo',
  'a disposicao da empresa',
  'a disposicao de empresa',
  'a disposicao',
  'disposicao da empresa',
  'disposicao de empresa',
  'disposicao',
  'sem preferencia',
  'sem restricao',
  'disponivel para qualquer',
  'disponivel para qualquer area',
  'disponivel para qualquer funcao',
  'disponivel para qualquer vaga',
  'o que a empresa precisar',
  'o que precisar',
  'area a definir',
  'cargo a definir',
  'a combinar',
  'em aberto',
  'a criterio da empresa',
  'em busca de oportunidade',
  'primeiro emprego',
  'nova oportunidade',
  'indiferente',
]

export function normalizeStringBasic(str: string | null | undefined): string {
  if (!str) return ''
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Retorna true APENAS se a string de objetivo for vazia, nula ou verdadeiramente
 * indeterminada/genérica ('Todos', 'Disposição da Empresa', etc.).
 * UMA LISTA de cargos específicos (ex: 'Administração Geral, Venda Externa...')
 * NÃO é genérico — é objetivo específico.
 */
export function isGenericObjective(str: string | null | undefined): boolean {
  if (!str) return true
  const rawTrimmed = String(str).trim()
  if (!rawTrimmed) return true

  // Se tem separadores de múltiplos cargos pretendidos (vírgula, ponto-e-vírgula, barra, pipe),
  // e contém termos profissionais específicos, trata-se de lista de cargos específicos, NUNCA genérico.
  const hasListSeparators = /[,;/|]/.test(rawTrimmed)
  if (hasListSeparators) {
    const segments = rawTrimmed
      .split(/[,;/|]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    // Se tiver mais de um segmento e algum deles contiver cargo estruturado (ex: admin, venda, fiscal, contas, etc.)
    if (segments.length > 1) {
      return false
    }
  }

  const norm = normalizeStringBasic(str)
  if (!norm) return true

  // Se contém palavras-chave de cargos específicos administrativos, comerciais, contábeis ou técnicos, NÃO é genérico
  const specificRoleKeywords = [
    'administrac',
    'comercial',
    'venda',
    'vendedor',
    'contabil',
    'contabilidade',
    'fiscal',
    'financa',
    'financeir',
    'compras',
    'custos',
    'recepcao',
    'secretaria',
    'rh',
    'recursos humanos',
    'psicolog',
    'advogad',
    'juridic',
    'ti',
    'informatica',
    'programador',
    'desenvolvedor',
    'professor',
    'enfermeir',
    'medico',
    'nutricion',
    'farmac',
    'designer',
    'marketing',
  ]

  for (const kw of specificRoleKeywords) {
    if (norm.includes(kw)) {
      return false
    }
  }

  // Verifica se é estritamente idêntico a algum padrão canônico genérico ou pequena variação
  return GENERIC_OBJECTIVE_PATTERNS.some((p) => {
    const normP = normalizeStringBasic(p)
    if (norm === normP) return true
    // Frases curtas como "a disposicao da empresa para uma nova oportunidade"
    if (norm.startsWith(normP) || norm.endsWith(normP)) return true
    if (norm.length <= 40 && norm.includes(normP)) return true
    return false
  })
}

export interface VagaBasicRequirements {
  minAge?: number | null
  maxAge?: number | null
  requiresCnhDOrE?: boolean
  requiresCnhAny?: boolean
  requiresFemaleCnhD?: boolean
  minSchooling?: 'fundamental' | 'medio' | 'superior' | null
  requiresHeavyDrivingExp?: boolean
  requiresFrentistaExp?: boolean
  requiresAlmoxarifadoExp?: boolean
  requiresLimpezaExp?: boolean
  requiresLavagemExp?: boolean
  raioKm?: number | null
  coords?: Coordinates | null
  locations?: string[]
}

/**
 * Extrai requisitos básicos estruturados dos critérios da vaga.
 */
export function parseVagaRequirements(vaga: any): VagaBasicRequirements {
  const req: VagaBasicRequirements = {
    minAge: null,
    maxAge: null,
    requiresCnhDOrE: false,
    requiresCnhAny: false,
    requiresFemaleCnhD: false,
    minSchooling: null,
    requiresHeavyDrivingExp: false,
    requiresFrentistaExp: false,
    requiresAlmoxarifadoExp: false,
    requiresLimpezaExp: false,
    requiresLavagemExp: false,
    raioKm: 20,
    coords: null,
    locations: [],
  }

  const crit = vaga?.criterios_qualificacao
  let texto = ''
  if (typeof crit === 'object' && crit !== null) {
    texto = (crit.texto_livre || '') + ' ' + JSON.stringify(crit)
    if (typeof crit.raio_km === 'number') req.raioKm = crit.raio_km
    if (Array.isArray(crit.localizacoes)) {
      req.locations = crit.localizacoes.map((l: any) =>
        [l.endereco, l.cidade, l.estado].filter(Boolean).join(', '),
      )
    }
  } else if (typeof crit === 'string') {
    texto = crit
  }

  const tituloNorm = normalizeStringBasic(vaga?.titulo || '')
  const textoNorm = normalizeStringBasic(texto)
  const fullText = `${tituloNorm} ${textoNorm}`

  // Raio padrão por cargo se não vier explícito
  if (req.raioKm === null || req.raioKm === undefined) {
    if (tituloNorm.includes('motorista')) req.raioKm = 20
    else if (tituloNorm.includes('cobrador')) req.raioKm = 20
    else if (tituloNorm.includes('abastecedor') || tituloNorm.includes('mecanico')) req.raioKm = 35
    else req.raioKm = 10
  }

  // Idade
  // "Idade dos 19 até 56 anos", "18 a 22 anos", "Idade até 53 anos", "Idade de até 58 anos"
  const ageRangeMatch = textoNorm.match(
    /(?:idade|faixa\s*etaria)?\s*(?:dos|entre|de)?\s*(\d{2})\s*(?:ate|a|e)\s*(\d{2})\s*anos?/i,
  )
  if (ageRangeMatch) {
    req.minAge = parseInt(ageRangeMatch[1], 10)
    req.maxAge = parseInt(ageRangeMatch[2], 10)
  } else {
    const ageMaxMatch = textoNorm.match(
      /(?:idade|faixa\s*etaria)?\s*(?:de\s*)?ate\s*(\d{2})\s*anos?/i,
    )
    if (ageMaxMatch) {
      req.maxAge = parseInt(ageMaxMatch[1], 10)
    }
    const ageMinMatch = textoNorm.match(
      /(?:idade|faixa\s*etaria)?\s*(?:minima\s*de|a\s*partir\s*de)\s*(\d{2})\s*anos?/i,
    )
    if (ageMinMatch) {
      req.minAge = parseInt(ageMinMatch[1], 10)
    }
  }

  // Se vaga for Jovem Aprendiz
  if (tituloNorm.includes('jovem aprendiz')) {
    if (!req.minAge) req.minAge = 18
    if (!req.maxAge) req.maxAge = 22
  }

  // CNH D ou E
  if (
    fullText.includes('categoria d ou e') ||
    fullText.includes('categoria d/e') ||
    fullText.includes('cnh d ou e') ||
    fullText.includes('cnh d/e') ||
    (tituloNorm.includes('motorista') && !fullText.includes('ajudante'))
  ) {
    req.requiresCnhDOrE = true
  }

  // Regra condicional mulheres
  if (
    fullText.includes('mulheres apenas se tiver categoria d') ||
    fullText.includes('mulheres apenas com cnh d')
  ) {
    req.requiresFemaleCnhD = true
  }

  // Escolaridade
  if (fullText.includes('medio')) {
    req.minSchooling = 'medio'
  } else if (fullText.includes('fundamental')) {
    req.minSchooling = 'fundamental'
  }

  // Experiência pesada de motorista
  if (tituloNorm.includes('motorista')) {
    req.requiresHeavyDrivingExp = true
  }

  // Experiência em abastecimento
  if (tituloNorm.includes('abastecedor')) {
    req.requiresFrentistaExp = true
  }

  // Experiência em almoxarifado
  if (tituloNorm.includes('almoxarifado')) {
    req.requiresAlmoxarifadoExp = true
  }

  // Experiência em lavagem
  if (tituloNorm.includes('lavador')) {
    req.requiresLavagemExp = true
  }

  // Experiência em limpeza
  if (tituloNorm.includes('limpeza') && !tituloNorm.includes('lider')) {
    req.requiresLimpezaExp = true
  }

  // Garagem / Coordenadas de referência
  if (tituloNorm.includes('cursino')) {
    req.coords = REFERENCE_LOCATIONS.cursino.approxCoords
  } else if (tituloNorm.includes('leste') || tituloNorm.includes('sapopemba')) {
    req.coords = REFERENCE_LOCATIONS.sapopemba.approxCoords
  } else if (req.locations && req.locations.length > 0) {
    const locStr = req.locations.join(' ').toLowerCase()
    if (locStr.includes('cursino')) {
      req.coords = REFERENCE_LOCATIONS.cursino.approxCoords
    } else if (
      locStr.includes('sevilha') ||
      locStr.includes('sapopemba') ||
      locStr.includes('leste')
    ) {
      req.coords = REFERENCE_LOCATIONS.sapopemba.approxCoords
    }
  }

  return req
}

export interface CandidateEvaluationResult {
  vaga: any
  distanciaKm: number | null
  dentroDoRaio: boolean
  raioMaximoKm: number | null
  score: number // 0 a 100
  passouBasicos: boolean // se atende a TODOS os eliminatórios
  detalhes: {
    motivosNaoEncaixe: string[]
    atendimentos: string[]
  }
}

/**
 * Avalia o candidato rigorosamente contra os requisitos básicos de uma vaga.
 * Retorna se passou nos requisitos básicos e uma pontuação de encaixe (score).
 */
export function evaluateCandidateAgainstVaga(
  cvData: any,
  vaga: any,
  candidateCoords: Coordinates | null,
): CandidateEvaluationResult {
  const req = parseVagaRequirements(vaga)
  const motivosNaoEncaixe: string[] = []
  const atendimentos: string[] = []
  let score = 50 // pontuação inicial base

  // 1. Proximidade / Distância
  let distKm: number | null = null
  let dentroDoRaio = true
  const vagaCoords =
    req.coords ||
    getReferenceCoordsForText(vaga?.titulo || '') ||
    getReferenceCoordsForText(vaga?.descricao || '')

  if (candidateCoords && vagaCoords) {
    distKm = calculateHaversineDistance(candidateCoords, vagaCoords)
    const limite = req.raioKm || 20
    if (distKm > limite) {
      dentroDoRaio = false
      motivosNaoEncaixe.push(
        `Distância (${distKm.toFixed(1)} km) excede o raio limite da garagem (${limite} km)`,
      )
      score -= 40
    } else {
      atendimentos.push(`Dentro do raio da garagem (${distKm.toFixed(1)} km <= ${limite} km)`)
      // Proximidade bonifica o score
      score += Math.max(0, Math.round(15 * (1 - distKm / limite)))
    }
  }

  // 2. Faixa Etária
  const idade = resolveCandidateAge(cvData?.idade, cvData?.data_nascimento)
  if (idade !== null) {
    if (req.minAge !== null && req.minAge !== undefined && idade < req.minAge) {
      motivosNaoEncaixe.push(`Idade (${idade} anos) abaixo do mínimo exigido (${req.minAge} anos)`)
      score -= 30
    } else if (req.maxAge !== null && req.maxAge !== undefined && idade > req.maxAge) {
      motivosNaoEncaixe.push(`Idade (${idade} anos) acima do limite exigido (${req.maxAge} anos)`)
      score -= 30
    } else {
      if (req.minAge || req.maxAge) {
        atendimentos.push(`Idade (${idade} anos) dentro da faixa exigida`)
        score += 10
      }
    }
  }

  // 3. CNH
  const cnhCat = normalizeCnhCategory(cvData?.cnh_categoria || cvData?.cnh || '')
  const hasCnhDOrE =
    cnhCat === 'D' ||
    cnhCat === 'E' ||
    cnhCat === 'AD' ||
    cnhCat === 'AE' ||
    (typeof cvData?.cnh === 'string' &&
      /\b(cnh|cat)\s*[:\s]*([a-c]*[de][a-e]*)\b/i.test(cvData.cnh))

  if (req.requiresCnhDOrE) {
    if (!hasCnhDOrE) {
      motivosNaoEncaixe.push(
        `Exige CNH Categoria D ou E (candidato possui: ${cnhCat || 'sem CNH D/E'})`,
      )
      score -= 40
    } else {
      atendimentos.push(`Possui CNH Categoria ${cnhCat || 'D/E'} exigida`)
      score += 25
    }
  }

  // Regra de CNH D para mulheres em Cobrador
  const nomeCandidato = String(cvData?.nome || '')
  const isFemale =
    cvData?.genero === 'feminino' ||
    cvData?.sexo === 'feminino' ||
    /^(maria|ana|juliana|camila|patricia|aline|amanda|beatriz|bruna|carolina|daniela|debora|fernanda|gabriela|jessica|larissa|leticia|luana|mariana|natalia|paula|rafaela|renata|sabrina|tatiane|vanessa|flavia|elisabete|elizabeth|andreia|marcia|simone|luciana|rosana|valeria|claudia|cristina|adriana|priscila|monica)\b/i.test(
      nomeCandidato,
    )

  if (req.requiresFemaleCnhD && isFemale) {
    if (!hasCnhDOrE) {
      motivosNaoEncaixe.push(
        `Candidata do sexo feminino necessita de CNH Categoria D para vaga de Cobrador`,
      )
      score -= 40
    } else {
      atendimentos.push(
        `Candidata possui CNH Categoria ${cnhCat || 'D'} conforme exigido para mulheres`,
      )
      score += 15
    }
  }

  // 4. Experiência Profissional
  const rawExps: any[] = Array.isArray(cvData?.experiencia_profissional)
    ? cvData.experiencia_profissional
    : Array.isArray(cvData?.experiencias)
      ? cvData.experiencias
      : []

  const allExpText = rawExps
    .map((e) =>
      typeof e === 'string' ? e : `${e.cargo || ''} ${e.empresa || ''} ${e.descricao || ''}`,
    )
    .join(' ')
    .toLowerCase()

  if (req.requiresHeavyDrivingExp) {
    const driverCheck = checkBusOrTruckDriverExperience(cvData)
    if (!driverCheck.hasValidBusOrTruckExp) {
      motivosNaoEncaixe.push(
        `Não possui experiência comprovada como motorista de ônibus ou caminhão`,
      )
      score -= 40
    } else {
      atendimentos.push(`Possui experiência comprovada em veículos pesados/ônibus/caminhão`)
      score += 25
    }
  }

  // Verificação de empresas restritas ativas
  const restrictedCheck = checkRestrictedCompanyStatus(cvData)
  if (restrictedCheck.isCurrentlyEmployedInRestricted) {
    motivosNaoEncaixe.push(
      `Vínculo atual na empresa concorrente restrita ${restrictedCheck.restrictedCompanyName}`,
    )
    score -= 50
  }

  // 5. Escolaridade
  // Todo nível superior satisfaz o fundamental. Se não temos formação informada, não eliminamos determinísticamente.
  const formacoes = Array.isArray(cvData?.formacao_academica) ? cvData.formacao_academica : []
  const formacaoText = formacoes
    .map((f: any) => (typeof f === 'string' ? f : `${f.curso || ''} ${f.instituicao || ''}`))
    .join(' ')
    .toLowerCase()

  if (req.minSchooling === 'medio') {
    if (
      formacaoText.length > 0 &&
      !formacaoText.includes('medio') &&
      !formacaoText.includes('superior') &&
      !formacaoText.includes('faculdade') &&
      !formacaoText.includes('gradua')
    ) {
      motivosNaoEncaixe.push(`Exige Ensino Médio completo`)
      score -= 15
    } else if (formacaoText.includes('medio') || formacaoText.includes('superior')) {
      atendimentos.push(`Escolaridade atende ao Ensino Médio`)
      score += 10
    }
  } else if (req.minSchooling === 'fundamental') {
    if (
      formacaoText.includes('fundamental') ||
      formacaoText.includes('medio') ||
      formacaoText.includes('superior')
    ) {
      atendimentos.push(`Escolaridade atende ao Ensino Fundamental`)
      score += 5
    }
  }

  // Bonificações adicionais por aderência ao cargo
  const tituloNorm = normalizeStringBasic(vaga?.titulo || '')
  let temAderenciaReal = false

  if (tituloNorm.includes('cobrador')) {
    // Experiências de atendimento, caixa, cobrador, ajudante de motorista, conferente, troco contam favoravelmente
    if (
      allExpText.includes('cobrador') ||
      allExpText.includes('caixa') ||
      allExpText.includes('atendimento') ||
      allExpText.includes('ajudante de motorista') ||
      allExpText.includes('conferente') ||
      allExpText.includes('fiscal de onibus') ||
      allExpText.includes('troco')
    ) {
      atendimentos.push(`Histórico profissional aderente à rotina de atendimento/cobrança`)
      score += 20
      temAderenciaReal = true
    }
  } else if (tituloNorm.includes('abastecedor')) {
    if (
      allExpText.includes('abastec') ||
      allExpText.includes('frentista') ||
      allExpText.includes('posto')
    ) {
      atendimentos.push(`Histórico com experiência em abastecimento/frentista`)
      score += 25
      temAderenciaReal = true
    }
  } else if (tituloNorm.includes('almoxarifado')) {
    if (
      allExpText.includes('almoxarif') ||
      allExpText.includes('estoque') ||
      allExpText.includes('conferente')
    ) {
      atendimentos.push(`Histórico com experiência em almoxarifado/controle de estoque`)
      score += 25
      temAderenciaReal = true
    }
  } else if (tituloNorm.includes('lavador')) {
    if (
      allExpText.includes('lavador') ||
      allExpText.includes('estetica automotiva') ||
      allExpText.includes('lavagem')
    ) {
      atendimentos.push(`Histórico com experiência em lavagem de veículos`)
      score += 25
      temAderenciaReal = true
    }
  } else if (tituloNorm.includes('limpeza')) {
    if (
      allExpText.includes('limpeza') ||
      allExpText.includes('asg') ||
      allExpText.includes('servicos gerais') ||
      allExpText.includes('zelador')
    ) {
      atendimentos.push(`Histórico com experiência em limpeza e conservação`)
      score += 25
      temAderenciaReal = true
    }
  } else if (tituloNorm.includes('motorista')) {
    if (req.requiresHeavyDrivingExp) {
      temAderenciaReal = true
    }
  }

  // Garante limite 0 a 100
  score = Math.max(0, Math.min(100, score))
  const passouBasicos = motivosNaoEncaixe.length === 0

  return {
    vaga,
    distanciaKm: distKm,
    dentroDoRaio,
    raioMaximoKm: req.raioKm || 20,
    score,
    passouBasicos,
    detalhes: {
      motivosNaoEncaixe,
      atendimentos,
    },
  }
}

/**
 * Avalia candidato com objetivo genérico contra TODAS as vagas abertas.
 * Implementa as regras (1), (2), (3) e (4):
 * (1) candidato com objetivo 'Todos', 'Disposição da Empresa', vazio avaliado contra TODAS vagas abertas
 *     próximas da garagem dele (dentro do raio de cada uma);
 * (2) fica SOMENTE com a de melhor encaixe nos requisitos básicos (faixa etária, experiência, CNH, escolaridade);
 * (3) se não encaixar em nenhuma, NÃO é aprovado em nenhuma — entra como 'Aguardando vaga adequada';
 * (4) se não estiver perto de nenhuma garagem, descartar de cara com motivo 'fora do raio de todas as vagas'.
 */
export async function evaluateGenericCandidateAgainstAllVagas(
  cvData: any,
  vagasAbertas: any[],
  googleApiKey: string | null,
): Promise<{
  chosenVaga: any | null
  rankedEvaluations: CandidateEvaluationResult[]
  candidateCoords: Coordinates | null
  foraDeTodasAsGaragens: boolean
  motivoDescarte: string | null
  justificativa: string
  aguardandoVaga: boolean
}> {
  const candidatoEndereco = formatAddressString(cvData?.endereco, cvData)
  let candidateCoords: Coordinates | null = null

  if (candidatoEndereco && googleApiKey) {
    candidateCoords = await geocodeAddress(candidatoEndereco, googleApiKey)
  }
  if (!candidateCoords && candidatoEndereco) {
    candidateCoords = getReferenceCoordsForText(candidatoEndereco)
  }

  // Avalia contra todas as vagas ativas
  const evaluations: CandidateEvaluationResult[] = vagasAbertas.map((vaga) =>
    evaluateCandidateAgainstVaga(cvData, vaga, candidateCoords),
  )

  // Checa se está fora do raio de TODAS as garagens
  // Se temos coordenadas e nenhuma das vagas tem dentroDoRaio == true
  const hasGeoloc = Boolean(candidateCoords)
  const algumaDentroDoRaio = evaluations.some((e) => e.dentroDoRaio)

  if (hasGeoloc && !algumaDentroDoRaio && evaluations.length > 0) {
    // REGRA 4: se não estiver perto de nenhuma garagem, descartar de cara com motivo 'fora do raio de todas as vagas'
    return {
      chosenVaga: null,
      rankedEvaluations: evaluations,
      candidateCoords,
      foraDeTodasAsGaragens: true,
      motivoDescarte: 'fora do raio de todas as vagas',
      justificativa: `Candidato mora fora do raio de atendimento de todas as garagens ativas do sistema (${candidatoEndereco || 'endereço cadastrado'}).`,
      aguardandoVaga: false,
    }
  }

  // Filtra vagas que estão dentro do raio (ou todas se não tiver coordenadas)
  const vagasNoRaio = evaluations.filter((e) => !hasGeoloc || e.dentroDoRaio)

  // Filtra vagas onde passou nos requisitos básicos
  const vagasEncaixadas = vagasNoRaio.filter((e) => e.passouBasicos)

  // Ordena por score decrescente
  vagasEncaixadas.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    // Em caso de empate de score, a mais próxima vence
    if (a.distanciaKm !== null && b.distanciaKm !== null) {
      return a.distanciaKm - b.distanciaKm
    }
    return 0
  })

  // REGRA 2: Fica SOMENTE com a de melhor encaixe nos requisitos básicos
  if (vagasEncaixadas.length > 0) {
    const bestMatch = vagasEncaixadas[0]
    const proxInfo =
      bestMatch.distanciaKm !== null ? ` (~${bestMatch.distanciaKm.toFixed(1)} km)` : ''
    return {
      chosenVaga: bestMatch.vaga,
      rankedEvaluations: vagasEncaixadas,
      candidateCoords,
      foraDeTodasAsGaragens: false,
      motivoDescarte: null,
      justificativa: `Candidato com objetivo genérico avaliado contra todas as vagas abertas. Melhor encaixe nos requisitos básicos: "${bestMatch.vaga.titulo}"${proxInfo} com score de aderência ${bestMatch.score}/100 (${bestMatch.detalhes.atendimentos.join(', ')}).`,
      aguardandoVaga: false,
    }
  }

  // REGRA 3: Se não encaixar em nenhuma, NÃO é aprovado em nenhuma —
  // entra como 'Aguardando vaga adequada' com o cargo pretendido registrado, nunca aprovado por folga
  return {
    chosenVaga: null,
    rankedEvaluations: evaluations.sort((a, b) => b.score - a.score),
    candidateCoords,
    foraDeTodasAsGaragens: false,
    motivoDescarte: null,
    justificativa:
      'Candidato com objetivo genérico avaliado contra todas as vagas abertas próximas, mas não atendeu aos requisitos básicos de nenhuma das funções ativas no momento. Registrado em "Aguardando vaga adequada".',
    aguardandoVaga: true,
  }
}

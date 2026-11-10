/**
 * Avaliação determinística de compatibilidade e pontuação de candidatos
 * contra requisitos básicos de uma vaga:
 * - Faixa etária
 * - Escolaridade mínima
 * - CNH necessária
 * - Experiência profissional mínima / tipo de condução
 * - Proximidade geográfica (dentro do raio da garagem)
 */

import {
  resolveCandidateAge,
  extractBirthDateWithContext,
  isPlausibleBirthDate,
} from './validation.ts'

export function extractCandidateAge(cvData: any): number | null {
  if (!cvData) return null
  let dataNasc = cvData.data_nascimento
  if (!dataNasc) {
    const rawText =
      typeof cvData.resumo_cv === 'string'
        ? cvData.resumo_cv
        : typeof cvData.texto_cv === 'string'
          ? cvData.texto_cv
          : null
    if (rawText) {
      dataNasc = extractBirthDateWithContext(rawText)
    }
  }

  if (dataNasc) {
    const plausibility = isPlausibleBirthDate(dataNasc)
    if (!plausibility.valida) {
      return null
    }
    return plausibility.idade
  }

  return resolveCandidateAge(cvData.idade, null)
}
import { checkBusOrTruckDriverExperience, checkRestrictedCompanyStatus } from './motorista.ts'
import { normalizeCnhCategory } from './cnh.ts'
import {
  calculateHaversineDistance,
  formatAddressString,
  geocodeAddress,
  getReferenceCoordsForText,
  isTruncatedOrIncompleteAddress,
  REFERENCE_LOCATIONS,
  Coordinates,
} from './proximity.ts'
import { geocodeNeighborhoodOrIncompleteAddress } from './geocode-neighborhood.ts'

export interface InferredCandidateRole {
  roles: string[]
  details: string[]
  summary: string
  shortExperience: boolean
}

/**
 * Infere áreas funcionais a partir do histórico de experiências e empresas.
 * Ex.: Agente de atendimento / Assistente de monitoramento -> relação com COC / Monitoramento / Atendimento.
 * A formação acadêmica complementa quando a experiência é curta ou ausente.
 */
export function inferCandidateRoleFromExperience(cvData: any): InferredCandidateRole {
  const rawExps: any[] = Array.isArray(cvData?.experiencia_profissional)
    ? cvData.experiencia_profissional
    : Array.isArray(cvData?.experiencias)
      ? cvData.experiencias
      : []

  const roles: string[] = []
  const details: string[] = []

  for (const exp of rawExps) {
    const cargo = normalizeStringBasic(typeof exp === 'string' ? exp : exp?.cargo || '')
    const empresa = normalizeStringBasic(typeof exp === 'string' ? '' : exp?.empresa || '')
    const desc = normalizeStringBasic(typeof exp === 'string' ? '' : exp?.descricao || '')
    const combined = `${cargo} ${empresa} ${desc}`

    if (
      combined.includes('monitoramento') ||
      combined.includes('cftv') ||
      combined.includes('rastreamento') ||
      combined.includes('telemetria') ||
      combined.includes('central de operac') ||
      combined.includes('coc') ||
      cargo.includes('operador de camera')
    ) {
      if (!roles.includes('monitoramento')) roles.push('monitoramento')
      details.push(
        `experiência em monitoramento/CFTV (${typeof exp === 'string' ? exp : exp?.cargo || 'monitoramento'})`,
      )
    }

    if (
      combined.includes('atendimento') ||
      combined.includes('call center') ||
      combined.includes('telemarketing') ||
      combined.includes('recepc') ||
      combined.includes('sac') ||
      cargo.includes('agente de atendimento') ||
      cargo.includes('atendente')
    ) {
      if (!roles.includes('atendimento')) roles.push('atendimento')
      details.push(
        `experiência em atendimento (${typeof exp === 'string' ? exp : exp?.cargo || 'atendimento'})`,
      )
    }

    if (
      combined.includes('cobrador') ||
      combined.includes('troco') ||
      combined.includes('caixa') ||
      combined.includes('bilheteiro')
    ) {
      if (!roles.includes('cobrador')) roles.push('cobrador')
      details.push(
        `experiência em cobrança/caixa (${typeof exp === 'string' ? exp : exp?.cargo || 'cobrança'})`,
      )
    }

    if (
      combined.includes('motorista') ||
      combined.includes('condutor') ||
      combined.includes('carreteiro')
    ) {
      if (!roles.includes('motorista')) roles.push('motorista')
      details.push(
        `experiência em condução/motorista (${typeof exp === 'string' ? exp : exp?.cargo || 'motorista'})`,
      )
    }

    if (
      combined.includes('mecanic') ||
      combined.includes('manutencao') ||
      combined.includes('eletricista') ||
      combined.includes('funilaria')
    ) {
      if (!roles.includes('mecanica')) roles.push('mecanica')
      details.push(
        `experiência em manutenção/mecânica (${typeof exp === 'string' ? exp : exp?.cargo || 'mecânica'})`,
      )
    }

    if (
      combined.includes('abastec') ||
      combined.includes('frentista') ||
      combined.includes('combustivel')
    ) {
      if (!roles.includes('abastecimento')) roles.push('abastecimento')
      details.push(
        `experiência em abastecimento (${typeof exp === 'string' ? exp : exp?.cargo || 'abastecimento'})`,
      )
    }

    if (
      combined.includes('almoxarif') ||
      combined.includes('estoque') ||
      combined.includes('expedicao') ||
      combined.includes('conferente') ||
      combined.includes('logistica')
    ) {
      if (!roles.includes('almoxarifado')) roles.push('almoxarifado')
      details.push(
        `experiência em almoxarifado/logística (${typeof exp === 'string' ? exp : exp?.cargo || 'almoxarifado'})`,
      )
    }

    if (
      combined.includes('lavador') ||
      combined.includes('estetica automotiva') ||
      combined.includes('higienizacao')
    ) {
      if (!roles.includes('lavagem')) roles.push('lavagem')
      details.push(
        `experiência em lavagem (${typeof exp === 'string' ? exp : exp?.cargo || 'lavagem'})`,
      )
    }

    if (
      combined.includes('limpeza') ||
      combined.includes('asg') ||
      combined.includes('servicos gerais') ||
      combined.includes('zelador')
    ) {
      if (!roles.includes('limpeza')) roles.push('limpeza')
      details.push(
        `experiência em limpeza (${typeof exp === 'string' ? exp : exp?.cargo || 'limpeza'})`,
      )
    }

    if (
      combined.includes('auxiliar administrat') ||
      combined.includes('assistente administrat') ||
      combined.includes('escritorio')
    ) {
      if (!roles.includes('administrativo')) roles.push('administrativo')
      details.push(
        `experiência administrativa (${typeof exp === 'string' ? exp : exp?.cargo || 'administrativo'})`,
      )
    }
  }

  // Avaliação de formação acadêmica quando experiência é curta (< 2 experiências ou sem histórico específico)
  const formacoes = Array.isArray(cvData?.formacao_academica) ? cvData.formacao_academica : []
  const hasShortExperience = rawExps.length <= 1

  const formacaoSummary: string[] = []
  if (hasShortExperience && formacoes.length > 0) {
    for (const f of formacoes) {
      const formText = normalizeStringBasic(
        typeof f === 'string' ? f : `${f?.curso || ''} ${f?.instituicao || ''}`,
      )
      if (
        formText.includes('ti') ||
        formText.includes('informatica') ||
        formText.includes('telecom')
      ) {
        if (!roles.includes('monitoramento')) roles.push('monitoramento')
        formacaoSummary.push('formação em informática/TI (monitoramento)')
      }
      if (formText.includes('mecanic') || formText.includes('automot')) {
        if (!roles.includes('mecanica')) roles.push('mecanica')
        formacaoSummary.push('formação em mecânica/automotiva')
      }
      if (formText.includes('logistica')) {
        if (!roles.includes('almoxarifado')) roles.push('almoxarifado')
        formacaoSummary.push('formação em logística/estoque')
      }
      if (
        formText.includes('administrac') ||
        formText.includes('gestao') ||
        formText.includes('contab')
      ) {
        if (!roles.includes('administrativo')) roles.push('administrativo')
        formacaoSummary.push('formação em administração/gestão')
      }
    }
  }

  let summary = ''
  if (roles.length > 0) {
    summary = `função inferida pela experiência: ${roles.join('/')}`
  } else if (hasShortExperience && formacaoSummary.length > 0) {
    summary = `função inferida por formação complementar: ${formacaoSummary.join('/')}`
  }

  return {
    roles,
    details,
    summary,
    shortExperience: hasShortExperience,
  }
}

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
  requiresMaleOnly?: boolean
  prohibitsCobradorExp?: boolean
  minSchooling?: 'fundamental' | 'medio' | 'superior' | null
  schoolingMandatory?: boolean
  requiresHeavyDrivingExp?: boolean
  requiresFrentistaExp?: boolean
  requiresAlmoxarifadoExp?: boolean
  requiresLimpezaExp?: boolean
  requiresLavagemExp?: boolean
  raioKm?: number | null
  coords?: Coordinates | null
  locations?: string[]
  rawTextoLivre?: string
}

export interface TextoLivreRestrictionCheck {
  violou: boolean
  motivo: string | null
  rebaixarScore: number
}

/**
 * Dedução determinística de gênero por nome BR e declarações explícitas de gênero/sexo.
 * Retorna 'feminino' | 'masculino' | 'indefinido'.
 */
export function inferCandidateGender(
  nome: string | null | undefined,
  generoDecl: string | null | undefined,
): 'feminino' | 'masculino' | 'indefinido' {
  const decl = normalizeStringBasic(generoDecl || '')
  if (decl.includes('fem') || decl === 'f' || decl.includes('mulher')) {
    return 'feminino'
  }
  if (decl.includes('masc') || decl === 'm' || decl.includes('homem')) {
    return 'masculino'
  }

  const rawNome = String(nome || '').trim()
  if (!rawNome) return 'indefinido'

  // Primeiro nome (limpo)
  const primeiroNome = normalizeStringBasic(rawNome.split(/\s+/)[0] || '')
  if (!primeiroNome) return 'indefinido'

  // Nomes compostos femininos comuns (ex: Maria Eduarda, Ana Paula, etc.)
  const nomeCompletoNorm = normalizeStringBasic(rawNome)
  if (
    nomeCompletoNorm.startsWith('maria ') ||
    nomeCompletoNorm.startsWith('ana ') ||
    nomeCompletoNorm.startsWith('mary ')
  ) {
    return 'feminino'
  }

  // Lista ampla de nomes femininos brasileiros
  const nomesFemininos = new Set([
    'catiana',
    'catia',
    'katia',
    'thalia',
    'talia',
    'irineia',
    'irineida',
    'maria',
    'ana',
    'juliana',
    'camila',
    'patricia',
    'aline',
    'amanda',
    'beatriz',
    'bruna',
    'carolina',
    'caroline',
    'daniela',
    'daniele',
    'debora',
    'fernanda',
    'gabriela',
    'gabriele',
    'jessica',
    'larissa',
    'leticia',
    'luana',
    'mariana',
    'natalia',
    'nathalia',
    'paula',
    'rafaela',
    'renata',
    'sabrina',
    'tatiane',
    'tatiana',
    'vanessa',
    'flavia',
    'elisabete',
    'elizabeth',
    'andreia',
    'marcia',
    'simone',
    'luciana',
    'rosana',
    'valeria',
    'claudia',
    'cristina',
    'adriana',
    'priscila',
    'priscilla',
    'monica',
    'lucia',
    'aparecida',
    'fatima',
    'sonia',
    'rita',
    'regina',
    'eliane',
    'solange',
    'cleide',
    'neuza',
    'tereza',
    'terezinha',
    'rose',
    'sueli',
    'suely',
    'cidinha',
    'marilene',
    'mariluce',
    'marisa',
    'neide',
    'iraci',
    'ivani',
    'ivone',
    'selma',
    'denise',
    'vanda',
    'wanda',
    'silvia',
    'elza',
    'joana',
    'zilda',
    'marlene',
    'marilda',
    'lucilene',
    'leila',
    'cleusa',
    'cleonice',
    'creusa',
    'arlete',
    'vera',
    'edna',
    'dalva',
    'noemi',
    'noemia',
    'isabela',
    'isabella',
    'isadora',
    'helena',
    'elisa',
    'lorena',
    'alice',
    'sophia',
    'sofia',
    'laura',
    'manuela',
    'emanuela',
    'valentina',
    'giovanna',
    'giovana',
    'yasmin',
    'iasmin',
    'rebeca',
    'clara',
    'cecilia',
    'luiza',
    'luisa',
    'stella',
    'estela',
    'barbara',
    'bianca',
    'tamires',
    'thais',
    'tais',
    'nayara',
    'naiara',
    'paloma',
    'pamela',
    'karina',
    'carina',
    'viviane',
    'vivian',
    'michele',
    'michelle',
    'carla',
    'raquel',
    'sheila',
    'silvana',
    'danielle',
    'cintia',
    'cinthia',
    'kelly',
    'keli',
    'suelen',
    'andressa',
    'milena',
    'mirella',
    'mayara',
    'daiane',
    'dayane',
    'fabiana',
    'jaqueline',
    'ingrid',
    'monique',
    'talita',
    'thalita',
    'giselle',
    'gisele',
    'poliana',
    'samara',
    'cristiane',
    'alessandra',
    'rosangela',
    'elisangela',
    'lucimeire',
    'shirley',
    'marli',
    'marly',
    'daniele',
    'franciele',
    'graziele',
    'roberta',
    'lidia',
    'mariane',
    'mirian',
    'myrian',
    'joelma',
    'telma',
    'dilma',
    'celia',
    'aurea',
    'norma',
    'solange',
    'deise',
    'rosilene',
    'valdirene',
    'lucineide',
    'luciana',
    'alda',
  ])

  if (nomesFemininos.has(primeiroNome)) {
    return 'feminino'
  }

  // Lista ampla de nomes masculinos brasileiros
  const nomesMasculinos = new Set([
    'carlos',
    'daniel',
    'rian',
    'igor',
    'cristiano',
    'eduardo',
    'joao',
    'lucas',
    'gabriel',
    'matheus',
    'mateus',
    'felipe',
    'gustavo',
    'guilherme',
    'bruno',
    'leonardo',
    'pedro',
    'tiago',
    'thiago',
    'rodrigo',
    'rafael',
    'marcos',
    'vinicius',
    'andre',
    'marcelo',
    'fernando',
    'alexandre',
    'diego',
    'ricardo',
    'caio',
    'victor',
    'vitor',
    'william',
    'willian',
    'renan',
    'fabio',
    'leandro',
    'julio',
    'marcio',
    'paulo',
    'sergio',
    'roberto',
    'antonio',
    'francisco',
    'jose',
    'luis',
    'luiz',
    'jorge',
    'claudio',
    'cesar',
    'mauricio',
    'alex',
    'alan',
    'allan',
    'adrian',
    'anderson',
    'alessandro',
    'cleber',
    'kleber',
    'danilo',
    'denis',
    'darlan',
    'douglas',
    'edson',
    'elias',
    'elton',
    'emerson',
    'erick',
    'eric',
    'fabiano',
    'fabricio',
    'gilberto',
    'gerson',
    'heitor',
    'helio',
    'henrique',
    'itamar',
    'ivan',
    'jailson',
    'jamil',
    'jeferon',
    'jefferson',
    'joilson',
    'jonas',
    'jonathan',
    'jonatas',
    'juliano',
    'laercio',
    'luciano',
    'manoel',
    'mauro',
    'michel',
    'murilo',
    'nelson',
    'nilton',
    'orlando',
    'osvaldo',
    'otavio',
    'patrik',
    'patrick',
    'renato',
    'reginaldo',
    'reinaldo',
    'rivaldo',
    'robson',
    'rogerio',
    'romario',
    'ronaldo',
    'ronan',
    'rubens',
    'samuel',
    'saulo',
    'sidney',
    'tales',
    'valdecir',
    'valdemar',
    'valdir',
    'vagner',
    'wagner',
    'valter',
    'walter',
    'vanderson',
    'washington',
    'wellingto',
    'wellington',
    'wesley',
    'wilson',
    'yuri',
    'davi',
    'david',
    'arthur',
    'artur',
    'bernardo',
    'heitor',
    'theo',
    'darlan',
    'breno',
    'cauã',
    'caua',
    'enzo',
    'kayque',
    'kaue',
    'lorran',
    'luan',
    'nicolas',
    'otavio',
  ])

  if (nomesMasculinos.has(primeiroNome)) {
    return 'masculino'
  }

  // Heurística de terminação em português:
  // Nomes terminados em 'a' tendem fortemente a feminino no Brasil (exceto poucas exceções masculinas)
  const excecoesMasculinasTerminaA = new Set([
    'luca',
    'lucas',
    'jean',
    'jonas',
    'elias',
    'lucena',
    'sena',
    'senna',
    'barbosa',
    'silva',
    'costa',
    'souza',
    'sousa',
    'moura',
    'fraga',
    'braga',
  ])
  if (primeiroNome.endsWith('a') && !excecoesMasculinasTerminaA.has(primeiroNome)) {
    return 'feminino'
  }

  // Nomes terminados em 'o', 'or', 'os', 'on', 'son', 'ton', 'mar', 'iel' tendem a masculino
  if (
    primeiroNome.endsWith('o') ||
    primeiroNome.endsWith('or') ||
    primeiroNome.endsWith('os') ||
    primeiroNome.endsWith('on') ||
    primeiroNome.endsWith('son') ||
    primeiroNome.endsWith('ton') ||
    primeiroNome.endsWith('mar') ||
    primeiroNome.endsWith('iel')
  ) {
    return 'masculino'
  }

  return 'indefinido'
}

/**
 * Validação determinística de restrições expressas no campo texto_livre dos critérios da vaga.
 * Cobre:
 * 1) Restrições de gênero condicionadas: mulheres apenas com CNH categoria D (ex: Cobrador).
 *    Quando a candidata é mulher e a CNH não consta ou não é D/E, tratar como NÃO atendida.
 * 2) Restrições de sexo exclusivas: ex: "Sexo Masculino", "Vaga para homens" (ex: Abastecedor, Lavador de Peças).
 * 3) Faixa de idade estrita: ex: "Idade dos 19 até 56 anos", "até 53 anos", "até 45 anos", "18 a 22 anos".
 * 4) Experiência proibida: ex: "Não pode ter experiência de cobrador", "Candidato não pode ter experiência de cobrador".
 * 5) Escolaridade exigida/obrigatória: ex: Ensino Médio completo.
 * NUNCA aprovar por omissão quando o dado obrigatório não constar.
 */
export function checkTextoLivreEliminatoryRestrictions(
  cvData: any,
  textoLivre: string | null | undefined,
  vagaTitulo: string | null | undefined,
): TextoLivreRestrictionCheck {
  if (!textoLivre && !vagaTitulo) {
    return { violou: false, motivo: null, rebaixarScore: 0 }
  }

  const tlNorm = normalizeStringBasic(textoLivre || '')
  const titNorm = normalizeStringBasic(vagaTitulo || '')
  const fullText = `${tlNorm} ${titNorm}`

  // Dedução determinística de gênero do candidato
  const deducedGender = inferCandidateGender(cvData?.nome, cvData?.genero || cvData?.sexo)
  const isCandidateFemale = deducedGender === 'feminino'
  const isGenderUnknown = deducedGender === 'indefinido'

  // CNH do candidato
  const cnhCat = normalizeCnhCategory(cvData?.cnh_categoria || cvData?.cnh || '') || ''
  const hasCnhDOrE =
    cnhCat === 'D' ||
    cnhCat === 'E' ||
    cnhCat === 'AD' ||
    cnhCat === 'AE' ||
    (typeof cvData?.cnh === 'string' &&
      /\b(cnh|cat)\s*[:\s]*([a-c]*[de][a-e]*)\b/i.test(cvData.cnh))

  // 1) Restrição condicional de gênero: "mulheres apenas se tiver categoria D na CNH"
  const hasMulheresCnhDRestriction =
    fullText.includes('mulheres apenas se tiver categoria d') ||
    fullText.includes('mulheres apenas se tiver cnh d') ||
    fullText.includes('mulheres apenas com cnh d') ||
    fullText.includes('mulheres apenas com categoria d') ||
    fullText.includes('mulheres somente se tiver categoria d') ||
    fullText.includes('mulheres apenas se possuir cnh d') ||
    (fullText.includes('mulheres') && fullText.includes('categoria d'))

  if (hasMulheresCnhDRestriction) {
    if (isCandidateFemale) {
      if (!hasCnhDOrE) {
        const cnhTexto = cnhCat
          ? `CNH Categoria ${cnhCat}`
          : 'sem CNH informada/mencionada no currículo'
        return {
          violou: true,
          motivo: `Não atende ao critério eliminatório da vaga: mulheres apenas se tiver categoria D na CNH (candidata do sexo feminino consta ${cnhTexto}).`,
          rebaixarScore: 50,
        }
      }
    } else if (isGenderUnknown && !hasCnhDOrE) {
      // Regra de segurança: não conseguindo verificar o gênero, nunca aprovar por omissão quando não tem CNH D
      return {
        violou: true,
        motivo: `Não atende ao critério eliminatório da vaga: mulheres apenas com CNH D e gênero do candidato não pôde ser determinado sem CNH D comprovada (nunca aprovar por omissão).`,
        rebaixarScore: 50,
      }
    }
  }

  // 2) Restrição de sexo exclusivo masculino (ex: "Sexo Masculino", "Vaga para homens")
  const hasMaleOnlyRestriction =
    fullText.includes('sexo masculino') ||
    fullText.includes('vaga para homens') ||
    fullText.includes('apenas homens') ||
    fullText.includes('somente homens')

  if (hasMaleOnlyRestriction && isCandidateFemale) {
    return {
      violou: true,
      motivo: `Não atende ao critério eliminatório da vaga: restrita a candidatos do sexo masculino.`,
      rebaixarScore: 50,
    }
  }

  // 3) Experiência proibida de cobrador ("Não pode ter experiência de cobrador")
  const hasProibicaoCobrador =
    fullText.includes('nao pode ter experiencia de cobrador') ||
    fullText.includes('nao pode ter experiencia como cobrador') ||
    fullText.includes('sem experiencia de cobrador') ||
    fullText.includes('candidato nao pode ter experiencia de cobrador') ||
    fullText.includes('proibido experiencia de cobrador')

  if (hasProibicaoCobrador) {
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

    const temExpCobrador =
      allExpText.includes('cobrador') ||
      allExpText.includes('cobradora') ||
      allExpText.includes('fiscal de onibus')

    if (temExpCobrador) {
      return {
        violou: true,
        motivo: `Não atende ao critério eliminatório da vaga: candidato não pode ter experiência anterior como cobrador de ônibus.`,
        rebaixarScore: 50,
      }
    }
  }

  // 4) Idade máxima / faixa de idade estrita
  let maxAge: number | null = null
  let minAge: number | null = null

  const matchAte = tlNorm.match(/ate\s+(\d{2})\s*anos/i)
  if (matchAte) {
    maxAge = parseInt(matchAte[1], 10)
  }

  const matchFaixa = tlNorm.match(/(?:de|dos|idade)\s*(\d{2})\s*(?:ate|a)\s*(\d{2})\s*anos/i)
  if (matchFaixa) {
    minAge = parseInt(matchFaixa[1], 10)
    maxAge = parseInt(matchFaixa[2], 10)
  }

  if (minAge !== null || maxAge !== null) {
    const candidateAge = extractCandidateAge(cvData)
    if (candidateAge !== null && candidateAge > 0) {
      if (minAge !== null && candidateAge < minAge) {
        return {
          violou: true,
          motivo: `Idade (${candidateAge} anos) abaixo do mínimo exigido pela vaga (${minAge} anos).`,
          rebaixarScore: 40,
        }
      }
      if (maxAge !== null && candidateAge > maxAge) {
        return {
          violou: true,
          motivo: `Idade (${candidateAge} anos) acima do limite máximo estabelecido nos critérios da vaga (${maxAge} anos).`,
          rebaixarScore: 40,
        }
      }
    }
  }

  return { violou: false, motivo: null, rebaixarScore: 0 }
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
    req.rawTextoLivre = crit.texto_livre || ''
    texto = (crit.texto_livre || '') + ' ' + JSON.stringify(crit)
    if (typeof crit.raio_km === 'number') req.raioKm = crit.raio_km
    if (Array.isArray(crit.localizacoes)) {
      req.locations = crit.localizacoes.map((l: any) =>
        [l.endereco, l.cidade, l.estado].filter(Boolean).join(', '),
      )
    }
  } else if (typeof crit === 'string') {
    req.rawTextoLivre = crit
    texto = crit
  }

  const tituloNorm = normalizeStringBasic(vaga?.titulo || '')
  const textoNorm = normalizeStringBasic(texto)
  const fullText = `${tituloNorm} ${textoNorm}`

  // Raio padrão por cargo se não vier explícito
  if (req.raioKm === null || req.raioKm === undefined) {
    if (tituloNorm.includes('motorista')) req.raioKm = 20
    else if (tituloNorm.includes('cobrador')) req.raioKm = 20
    else if (tituloNorm.includes('coc') || tituloNorm.includes('monitoramento')) req.raioKm = 25
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

  // Regra condicional mulheres: "mulheres apenas se tiver categoria D na CNH"
  if (
    fullText.includes('mulheres apenas se tiver categoria d') ||
    fullText.includes('mulheres apenas se tiver cnh d') ||
    fullText.includes('mulheres apenas com cnh d') ||
    fullText.includes('mulheres apenas com categoria d') ||
    fullText.includes('mulheres somente se tiver categoria d') ||
    fullText.includes('mulheres apenas se possuir cnh d') ||
    (fullText.includes('mulheres') && fullText.includes('categoria d'))
  ) {
    req.requiresFemaleCnhD = true
  }

  // Restrição de sexo exclusivamente masculino ("Sexo Masculino", "Vaga para homens", "Apenas homens")
  if (
    fullText.includes('sexo masculino') ||
    fullText.includes('para homens') ||
    fullText.includes('apenas homens') ||
    fullText.includes('somente homens')
  ) {
    req.requiresMaleOnly = true
  }

  // Experiência proibida de cobrador ("Não pode ter experiência de cobrador", "Candidato não pode ter experiência de cobrador")
  if (
    fullText.includes('nao pode ter experiencia de cobrador') ||
    fullText.includes('nao pode ter experiencia como cobrador') ||
    fullText.includes('sem experiencia de cobrador') ||
    fullText.includes('proibido experiencia de cobrador')
  ) {
    req.prohibitsCobradorExp = true
  }

  // Escolaridade
  if (fullText.includes('medio')) {
    req.minSchooling = 'medio'
    // Verifica se é obrigatório ("obrigatório", "exigido", ou não marcado como apenas "desejável")
    if (
      fullText.includes('exigido') ||
      fullText.includes('obrigatorio') ||
      !fullText.includes('desejavel ensino medio')
    ) {
      req.schoolingMandatory = true
    }
  } else if (fullText.includes('fundamental')) {
    req.minSchooling = 'fundamental'
    if (fullText.includes('exigido') || fullText.includes('obrigatorio')) {
      req.schoolingMandatory = true
    }
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
  } else if (fullText.includes('cursino')) {
    req.coords = REFERENCE_LOCATIONS.cursino.approxCoords
  } else if (fullText.includes('sapopemba') || fullText.includes('leste')) {
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
  temAderenciaReal: boolean
  funcaoInferida?: string | null
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
  // Motorista profissional de ônibus urbano ou caminhão tem CNH D/E implícita/presumida
  // pela legislação brasileira (CTB exige D/E para conduzir ônibus coletivo urbano).
  const driverExpCheck = checkBusOrTruckDriverExperience(cvData)
  const hasBusOrTruckExpImpliesCnh = driverExpCheck.hasValidBusOrTruckExp

  const hasCnhDOrE =
    cnhCat === 'D' ||
    cnhCat === 'E' ||
    cnhCat === 'AD' ||
    cnhCat === 'AE' ||
    (typeof cvData?.cnh === 'string' &&
      /\b(cnh|cat)\s*[:\s]*([a-c]*[de][a-e]*)\b/i.test(cvData.cnh)) ||
    hasBusOrTruckExpImpliesCnh

  if (req.requiresCnhDOrE) {
    if (!hasCnhDOrE) {
      motivosNaoEncaixe.push(
        `Exige CNH Categoria D ou E (candidato possui: ${cnhCat || 'sem CNH D/E'})`,
      )
      score -= 40
    } else {
      const cnhDesc = cnhCat
        ? `CNH Categoria ${cnhCat}`
        : 'CNH D/E comprovada por experiência em transporte coletivo'
      atendimentos.push(`Possui ${cnhDesc} exigida`)
      score += 25
    }
  }

  // Regra de CNH D para mulheres em Cobrador (ou vaga com texto_livre "Mulheres apenas se tiver categoria D na CNH")
  const deducedGender = inferCandidateGender(cvData?.nome, cvData?.genero || cvData?.sexo)
  const isFemale = deducedGender === 'feminino'
  const isUnknownGender = deducedGender === 'indefinido'

  if (req.requiresFemaleCnhD) {
    if (isFemale) {
      if (!hasCnhDOrE) {
        // Regra mandante do RH: nunca aprovar por omissão; se a CNH não foi mencionada ou não é CNH D/E, reprovar/não atender
        motivosNaoEncaixe.push(
          `Candidata do sexo feminino necessita de CNH Categoria D para esta vaga (critério da vaga: "Mulheres apenas se tiver categoria D na CNH"; candidata não possui CNH D comprovada)`,
        )
        score -= 50
      } else {
        atendimentos.push(
          `Candidata possui CNH Categoria ${cnhCat || 'D'} conforme exigido para mulheres`,
        )
        score += 15
      }
    } else if (isUnknownGender && !hasCnhDOrE) {
      motivosNaoEncaixe.push(
        `Vaga exige CNH Categoria D para candidatas mulheres; sem gênero definido e sem CNH D comprovada, não é possível aprovar por omissão`,
      )
      score -= 50
    }
  }

  // Restrição de sexo exclusivamente masculino (ex: Abastecedor, Lavador de Peças)
  if (req.requiresMaleOnly && isFemale) {
    motivosNaoEncaixe.push(
      `Vaga restrita a candidatos do sexo masculino conforme critérios da vaga`,
    )
    score -= 50
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

  // Restrição de experiência proibida de cobrador ("Não pode ter experiência de cobrador")
  if (req.prohibitsCobradorExp) {
    const temExpCobrador =
      allExpText.includes('cobrador') ||
      allExpText.includes('cobradora') ||
      allExpText.includes('fiscal de onibus')
    if (temExpCobrador) {
      motivosNaoEncaixe.push(
        `Critério eliminatório da vaga: não pode ter experiência anterior como cobrador de ônibus`,
      )
      score -= 50
    } else {
      atendimentos.push(`Atende ao critério de não ter experiência anterior como cobrador`)
    }
  }

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
  const formacoes = Array.isArray(cvData?.formacao_academica) ? cvData.formacao_academica : []
  const formacaoText = formacoes
    .map((f: any) => (typeof f === 'string' ? f : `${f.curso || ''} ${f.instituicao || ''}`))
    .join(' ')
    .toLowerCase()

  if (req.minSchooling === 'medio') {
    const hasMedioOrSuperior =
      formacaoText.includes('medio') ||
      formacaoText.includes('superior') ||
      formacaoText.includes('faculdade') ||
      formacaoText.includes('gradua') ||
      formacaoText.includes('tecnico')

    if (!hasMedioOrSuperior) {
      if (req.schoolingMandatory || formacaoText.length > 0) {
        motivosNaoEncaixe.push(
          `Exige Ensino Médio completo (escolaridade informada não atende ou não consta)`,
        )
        score -= 25
      }
    } else {
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

  // 6. Salvaguarda Determinística direta via checkTextoLivreEliminatoryRestrictions
  const textoLivreCheck = checkTextoLivreEliminatoryRestrictions(
    cvData,
    req.rawTextoLivre,
    vaga?.titulo,
  )
  if (textoLivreCheck.violou && textoLivreCheck.motivo) {
    if (!motivosNaoEncaixe.includes(textoLivreCheck.motivo)) {
      motivosNaoEncaixe.push(textoLivreCheck.motivo)
    }
    score = Math.max(0, score - textoLivreCheck.rebaixarScore)
  }

  // Inferência de funções a partir da experiência profissional
  const inferredRoleData = inferCandidateRoleFromExperience(cvData)
  const inferredRolesText = inferredRoleData.summary

  // Bonificações adicionais por aderência funcional ao cargo
  const tituloNorm = normalizeStringBasic(vaga?.titulo || '')
  let temAderenciaReal = false

  // Se a vaga for COC ou Monitoramento ou Central de Operações
  if (
    tituloNorm.includes('coc') ||
    tituloNorm.includes('monitoramento') ||
    tituloNorm.includes('central de operacoes') ||
    tituloNorm.includes('operador de cftv') ||
    tituloNorm.includes('rastreamento')
  ) {
    if (
      allExpText.includes('monitoramento') ||
      allExpText.includes('cftv') ||
      allExpText.includes('rastreamento') ||
      allExpText.includes('telemetria') ||
      allExpText.includes('central de operac') ||
      allExpText.includes('atendimento') ||
      allExpText.includes('operador de camera') ||
      allExpText.includes('fiscal de monitor') ||
      allExpText.includes('agente de atendimento') ||
      inferredRoleData.roles.includes('monitoramento') ||
      inferredRoleData.roles.includes('atendimento')
    ) {
      atendimentos.push(
        `Histórico profissional altamente aderente à função de monitoramento/COC (função inferida: ${inferredRolesText || 'monitoramento/atendimento'})`,
      )
      score += 35
      temAderenciaReal = true
    } else if (
      formacaoText.includes('ti') ||
      formacaoText.includes('informatica') ||
      formacaoText.includes('telecom')
    ) {
      atendimentos.push(`Formação técnica complementar para monitoramento/COC`)
      score += 15
      temAderenciaReal = true
    }
  } else if (tituloNorm.includes('cobrador')) {
    // Experiências de atendimento, caixa, cobrador, ajudante de motorista, conferente, troco contam favoravelmente
    if (
      allExpText.includes('cobrador') ||
      allExpText.includes('caixa') ||
      allExpText.includes('atendimento') ||
      allExpText.includes('ajudante de motorista') ||
      allExpText.includes('conferente') ||
      allExpText.includes('fiscal de onibus') ||
      allExpText.includes('troco') ||
      inferredRoleData.roles.includes('cobrador') ||
      inferredRoleData.roles.includes('atendimento') ||
      inferredRoleData.roles.includes('caixa')
    ) {
      atendimentos.push(
        `Histórico profissional aderente à rotina de atendimento/cobrança${inferredRolesText ? ` (função inferida: ${inferredRolesText})` : ''}`,
      )
      score += 20
      temAderenciaReal = true
    } else if (
      formacaoText.includes('administrac') ||
      formacaoText.includes('comerc') ||
      formacaoText.includes('atendimento') ||
      formacaoText.includes('gestao')
    ) {
      atendimentos.push(
        `Formação complementar em área administrativa/atendimento para suporte à cobrança`,
      )
      score += 10
      temAderenciaReal = true
    }
  } else if (tituloNorm.includes('abastecedor')) {
    if (
      allExpText.includes('abastec') ||
      allExpText.includes('frentista') ||
      allExpText.includes('posto') ||
      inferredRoleData.roles.includes('abastecimento')
    ) {
      atendimentos.push(`Histórico com experiência em abastecimento/frentista`)
      score += 25
      temAderenciaReal = true
    } else if (formacaoText.includes('mecanic') || formacaoText.includes('automot')) {
      atendimentos.push(`Formação técnica complementar em mecânica/automotiva`)
      score += 10
      temAderenciaReal = true
    }
  } else if (tituloNorm.includes('almoxarifado')) {
    if (
      allExpText.includes('almoxarif') ||
      allExpText.includes('estoque') ||
      allExpText.includes('conferente') ||
      inferredRoleData.roles.includes('almoxarifado') ||
      inferredRoleData.roles.includes('logistica')
    ) {
      atendimentos.push(`Histórico com experiência em almoxarifado/controle de estoque`)
      score += 25
      temAderenciaReal = true
    } else if (formacaoText.includes('logistica') || formacaoText.includes('administrac')) {
      atendimentos.push(`Formação complementar em logística/administração para almoxarifado`)
      score += 10
      temAderenciaReal = true
    }
  } else if (tituloNorm.includes('lavador')) {
    if (
      allExpText.includes('lavador') ||
      allExpText.includes('estetica automotiva') ||
      allExpText.includes('lavagem') ||
      inferredRoleData.roles.includes('lavagem')
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
      allExpText.includes('zelador') ||
      inferredRoleData.roles.includes('limpeza')
    ) {
      atendimentos.push(`Histórico com experiência em limpeza e conservação`)
      score += 25
      temAderenciaReal = true
    }
  } else if (tituloNorm.includes('motorista')) {
    if (req.requiresHeavyDrivingExp) {
      temAderenciaReal = true
    }
  } else if (tituloNorm.includes('mecanico')) {
    if (
      allExpText.includes('mecanic') ||
      allExpText.includes('manutencao') ||
      allExpText.includes('eletricista') ||
      inferredRoleData.roles.includes('mecanica')
    ) {
      atendimentos.push(`Histórico com experiência em mecânica/manutenção`)
      score += 25
      temAderenciaReal = true
    } else if (
      formacaoText.includes('mecanic') ||
      formacaoText.includes('automot') ||
      formacaoText.includes('eletrotecn')
    ) {
      atendimentos.push(`Formação técnica complementar em mecânica/manutenção`)
      score += 15
      temAderenciaReal = true
    }
  } else if (
    tituloNorm.includes('administrativo') ||
    tituloNorm.includes('auxiliar de escritorio')
  ) {
    if (
      inferredRoleData.roles.includes('administrativo') ||
      inferredRoleData.roles.includes('atendimento') ||
      allExpText.includes('auxiliar administrat') ||
      allExpText.includes('assistente administrat')
    ) {
      atendimentos.push(`Histórico profissional em funções administrativas/atendimento`)
      score += 25
      temAderenciaReal = true
    } else if (formacaoText.includes('administrac') || formacaoText.includes('gestao')) {
      atendimentos.push(`Formação complementar em administração`)
      score += 15
      temAderenciaReal = true
    }
  }

  // REGRA DO USUÁRIO: Requisitos demográficos (idade, CNH, escolaridade) seguem necessários,
  // mas NUNCA bastam sozinhos para aprovar uma vaga se não houver qualquer relação/aderência com a função.
  // Se não tem aderência funcional nem experiência/formação correlata, penaliza o score para não aprovar sem relação.
  if (!temAderenciaReal) {
    // Vagas que exigem função específica não devem ser aprovadas puramente por requisitos demográficos
    motivosNaoEncaixe.push(
      `Sem experiência profissional ou formação correlata com a função "${vaga?.titulo || ''}"`,
    )
    score = Math.max(0, score - 35)
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
    temAderenciaReal,
    funcaoInferida: inferredRolesText || null,
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

  // Geocodificação com suporte a bairro puro/endereço incompleto
  if (candidatoEndereco) {
    if (isTruncatedOrIncompleteAddress(candidatoEndereco)) {
      const geoBairro = await geocodeNeighborhoodOrIncompleteAddress(
        candidatoEndereco,
        googleApiKey,
        JSON.stringify(cvData || {}),
      )
      if (geoBairro.coords) {
        candidateCoords = geoBairro.coords
      }
    }

    if (!candidateCoords && googleApiKey) {
      candidateCoords = await geocodeAddress(candidatoEndereco, googleApiKey)
    }

    if (!candidateCoords) {
      candidateCoords = getReferenceCoordsForText(candidatoEndereco)
    }
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
    // REGRA 4: se não estiver perto de nenhuma garagem, descartar de cara com motivo 'Fora do raio de todas as garagens'
    return {
      chosenVaga: null,
      rankedEvaluations: evaluations,
      candidateCoords,
      foraDeTodasAsGaragens: true,
      motivoDescarte: 'Fora do raio de todas as garagens',
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

  // Inferência global para resumo
  const inferredGlobal = inferCandidateRoleFromExperience(cvData)
  const inferredComplement = inferredGlobal.summary ? ` (${inferredGlobal.summary})` : ''

  // REGRA 2: Fica SOMENTE com a de melhor encaixe nos requisitos básicos
  if (vagasEncaixadas.length > 0) {
    const bestMatch = vagasEncaixadas[0]
    const proxInfo =
      bestMatch.distanciaKm !== null ? ` (~${bestMatch.distanciaKm.toFixed(1)} km)` : ''
    const inferenciaMsg = bestMatch.funcaoInferida
      ? ` [${bestMatch.funcaoInferida}]`
      : inferredComplement

    return {
      chosenVaga: bestMatch.vaga,
      rankedEvaluations: vagasEncaixadas,
      candidateCoords,
      foraDeTodasAsGaragens: false,
      motivoDescarte: null,
      justificativa: `Candidato com objetivo genérico avaliado contra todas as vagas abertas${inferenciaMsg}. Melhor encaixe nos requisitos básicos: "${bestMatch.vaga.titulo}"${proxInfo} com score de aderência ${bestMatch.score}/100 (${bestMatch.detalhes.atendimentos.join(', ')}).`,
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
    justificativa: `Candidato com objetivo genérico avaliado contra todas as vagas abertas próximas${inferredComplement}, mas não atendeu aos requisitos básicos/aderência de nenhuma das funções ativas no momento. Registrado em "Aguardando vaga adequada".`,
    aguardandoVaga: true,
  }
}

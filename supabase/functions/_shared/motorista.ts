/**
 * Utilitários e salvaguardas para vagas de Motorista (Ônibus / Caminhão / Veículos Pesados).
 * Regra Permanente:
 * Experiência com Uber, 99, Cabify, Indrive, táxi, carro de passeio, veículo leve ou pequeno/médio porte,
 * motorista de aplicativo ou motorista particular NÃO conta como experiência profissional para
 * vagas de Motorista de Ônibus ou Caminhão!
 */

function normalizeText(text: string): string {
  if (!text) return ''
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/**
 * Retorna true se a descrição, cargo ou texto for de motorista de aplicativo / carro de passeio / veículo leve.
 */
export function isAppOrLightVehicleDriver(text: string): boolean {
  if (!text) return false
  const norm = normalizeText(text)

  const terms = [
    'uber',
    '99app',
    '99 app',
    '99pop',
    '99 pop',
    'cabify',
    'indrive',
    'in drive',
    'motorista de aplicativo',
    'motorista de app',
    'motorista por aplicativo',
    'motorista particular',
    'carro de passeio',
    'veiculo de passeio',
    'veiculo pequeno',
    'veiculos de pequeno',
    'pequeno e medio porte',
    'pequeno porte',
    'medio porte',
    'carro proprio',
    'veiculo proprio',
    'transporte particular',
    'transporte por aplicativo',
    'passageiros em veiculos de pequeno',
  ]

  return terms.some((term) => norm.includes(term))
}

export interface DriverExperienceCheck {
  hasValidBusOrTruckExp: boolean
  hasOnlyLightOrAppExp: boolean
  appOrLightExperiencesFound: string[]
  validExperiencesFound: string[]
}

/**
 * Avalia o histórico profissional e textos do currículo para vagas de Motorista de Ônibus ou Caminhão.
 */
export function checkBusOrTruckDriverExperience(cvData: any): DriverExperienceCheck {
  const result: DriverExperienceCheck = {
    hasValidBusOrTruckExp: false,
    hasOnlyLightOrAppExp: false,
    appOrLightExperiencesFound: [],
    validExperiencesFound: [],
  }

  if (!cvData) return result

  let rawExperiences: any[] = []
  if (Array.isArray(cvData.experiencia_profissional)) {
    rawExperiences = cvData.experiencia_profissional
  } else if (Array.isArray(cvData.experiencias)) {
    rawExperiences = cvData.experiencias
  } else if (Array.isArray(cvData.historico_profissional)) {
    rawExperiences = cvData.historico_profissional
  } else if (typeof cvData.experiencia_profissional === 'string') {
    rawExperiences = [cvData.experiencia_profissional]
  }

  const heavyDrivingKeywords = [
    'onibus',
    'caminhao',
    'caminhoneiro',
    'carreta',
    'carreteiro',
    'articulado',
    'biarticulado',
    'pesado',
    'veiculo pesado',
    'veiculos pesados',
    'grande porte',
    'coletivo',
    'transporte coletivo',
    'transporte urbano',
    'rodoviario',
    'viacao',
    'movebuss',
    'express',
    'mobibrasil',
    'sambaiba',
    'gato preto',
    'transpass',
    'kbpk',
    'metra',
    'emtu',
    'sptrans',
    'toco',
    'truck',
    'cavalo mecanico',
    'semirreboque',
    'rodotrem',
    'bitrem',
  ]

  const nonDrivingTerms = [
    'ajudante',
    'auxiliar',
    'fiscal',
    'lavador',
    'operador de loja',
    'operador de caixa',
    'vigilante',
    'monitoramento',
    'chefe de monitoramento',
    'repositor',
    'balconista',
    'estoquista',
    'atendente',
    'carga e descarga',
    'carga/descarga',
  ]

  for (const exp of rawExperiences) {
    let cargo = ''
    let empresa = ''
    let descricao = ''

    if (typeof exp === 'string') {
      descricao = exp
    } else if (typeof exp === 'object' && exp !== null) {
      cargo = exp.cargo || exp.funcao || exp.titulo || exp.role || ''
      empresa = exp.empresa || exp.company || ''
      descricao = exp.descricao || exp.atividades || exp.resumo || ''
    }

    const fullExpText = `${cargo} ${empresa} ${descricao}`
    const normFull = normalizeText(fullExpText)
    const normCargo = normalizeText(cargo)

    // Se é cargo ou texto de não condução sem ser motorista
    const isNonDriving = nonDrivingTerms.some((ndt) => normCargo.includes(ndt))
    if (isNonDriving && !normCargo.includes('motorista') && !normCargo.includes('condutor')) {
      continue
    }

    const normEmpresa = normalizeText(empresa)

    const isLightOrApp =
      isAppOrLightVehicleDriver(fullExpText) ||
      normCargo.includes('uber') ||
      normCargo.includes('99') ||
      normCargo.includes('aplicativo') ||
      normEmpresa.includes('uber') ||
      normEmpresa.includes('99') ||
      normEmpresa.includes('cabify') ||
      normEmpresa.includes('indrive')

    const isHeavyDriving =
      heavyDrivingKeywords.some(
        (kw) => normFull.includes(kw) || normCargo.includes(kw) || normEmpresa.includes(kw),
      ) && !isNonDriving

    if (isHeavyDriving) {
      result.validExperiencesFound.push(`${cargo || 'Motorista'} na empresa ${empresa || 'N/I'}`)
      result.hasValidBusOrTruckExp = true
    } else if (isLightOrApp) {
      result.appOrLightExperiencesFound.push(
        `${cargo || 'Motorista'} (${empresa || 'Aplicativo/Veículo leve'}): ${descricao || cargo}`,
      )
    }
  }

  // Se tem apenas experiências leves/aplicativo e nenhuma em ônibus/caminhão/pesados
  if (result.appOrLightExperiencesFound.length > 0 && !result.hasValidBusOrTruckExp) {
    result.hasOnlyLightOrAppExp = true
  }

  return result
}

/**
 * Lista oficial de empresas restritas / concorrentes definidas pelo RH da Via Sudeste:
 * Express, Movebuss, MobiBrasil, Transunião, Ambiental Transporte, Viação Campo Belo,
 * Viação Grajaú, Vip transporte urbanos, Viação Metrópole Paulista, Pêssego,
 * Allibus Transportes, Santa Brígida, Viação Gatusa, Gato Preto, KBPX e A2 Transporte.
 *
 * REGRA DO RH:
 * O candidato só é ELIMINADO se estiver trabalhando ATUALMENTE em alguma dessas empresas.
 * Experiência PASSADA nessas empresas NÃO elimina.
 */
export const RESTRICTED_COMPANIES = [
  'express',
  'movebuss',
  'move buss',
  'mobibrasil',
  'mobi brasil',
  'transuniao',
  'transuniao transportes',
  'ambiental transporte',
  'ambiental transportes',
  'viacao campo belo',
  'campo belo',
  'viacao grajau',
  'grajau',
  'vip transporte urbanos',
  'vip transportes urbanos',
  'vip transporte',
  'vip transportes',
  'viacao metropole paulista',
  'metropole paulista',
  'metropole',
  'pessego',
  'pessego transportes',
  'allibus transportes',
  'allibus',
  'santa brigida',
  'viacao santa brigida',
  'viacao gatusa',
  'gatusa',
  'gato preto',
  'viacao gato preto',
  'kbpx',
  'a2 transporte',
  'a2 transportes',
]

export interface RestrictedCompanyCheck {
  isCurrentlyEmployedInRestricted: boolean
  hasPastExperienceInRestricted: boolean
  restrictedCompanyName: string | null
  currentPeriodDescription: string | null
  evidenceText: string | null
}

/**
 * Avalia se o candidato está ATUALMENTE empregado em empresa restrita vs experiência passada.
 */
export function checkRestrictedCompanyStatus(cvData: any): RestrictedCompanyCheck {
  const result: RestrictedCompanyCheck = {
    isCurrentlyEmployedInRestricted: false,
    hasPastExperienceInRestricted: false,
    restrictedCompanyName: null,
    currentPeriodDescription: null,
    evidenceText: null,
  }

  if (!cvData) return result

  let rawExperiences: any[] = []
  if (Array.isArray(cvData.experiencia_profissional)) {
    rawExperiences = cvData.experiencia_profissional
  } else if (Array.isArray(cvData.experiencias)) {
    rawExperiences = cvData.experiencias
  } else if (Array.isArray(cvData.historico_profissional)) {
    rawExperiences = cvData.historico_profissional
  } else if (typeof cvData.experiencia_profissional === 'string') {
    rawExperiences = [cvData.experiencia_profissional]
  }

  for (const exp of rawExperiences) {
    let empresa = ''
    let cargo = ''
    let periodo = ''
    let isAtualExplicit = false
    let fullText = ''

    if (typeof exp === 'string') {
      fullText = exp
      empresa = exp
      periodo = exp
    } else if (typeof exp === 'object' && exp !== null) {
      empresa = exp.empresa || exp.company || ''
      cargo = exp.cargo || exp.funcao || exp.titulo || exp.role || ''
      periodo = exp.periodo || exp.datas || exp.dates || exp.tempo || ''
      isAtualExplicit = Boolean(exp.atual || exp.is_current || exp.ativo)
      fullText = `${cargo} ${empresa} ${periodo} ${exp.descricao || ''}`
    }

    const normEmpresa = normalizeText(empresa)
    const normFull = normalizeText(fullText)

    // Verifica se coincide com alguma empresa restrita
    const matchedRestricted = RESTRICTED_COMPANIES.find((rc) => {
      return normEmpresa.includes(rc) || normFull.includes(rc)
    })

    if (!matchedRestricted) continue

    // Detectar se o vínculo é ATUAL ou PASSADO
    const normPeriodo = normalizeText(periodo)
    const textToCheck = `${normPeriodo} ${normFull}`

    // Padrões que indicam vínculo ATUAL / ATIVO
    const isAtualRegex =
      /\b(atual|atualmente|presente|present|o momento|ate o momento|ate hoje|trabalhando atualmente|emprego atual|ativo)\b/i
    const isExplicitCurrent = isAtualExplicit || isAtualRegex.test(textToCheck)

    // Padrões com datas que indicam término explícito no passado:
    // Ex: "02/2023 - 04/2025", "15/07/24 a 11/09/26", "2014 - 2024", "mai/2021 a abr/2023", "01/2020 a 12/2022"
    // Padrão: data inicio [separador a/ate/-] data fim (onde a data fim NÃO é atual)
    const hasPastDateRangeRegex =
      /(?:\d{2}[\/\.]\d{2}[\/\.]\d{2,4}|\d{2}[\/\.]\d{4}|\d{4})\s*(?:[aáà\-]|\s+ate\s+|\s+a\s+)\s*(?:\d{2}[\/\.]\d{2}[\/\.]\d{2,4}|\d{2}[\/\.]\d{4}|\d{4})/i
    const hasExplicitEndDate = hasPastDateRangeRegex.test(periodo)

    if (isExplicitCurrent && !hasExplicitEndDate) {
      result.isCurrentlyEmployedInRestricted = true
      result.restrictedCompanyName = empresa || matchedRestricted
      result.currentPeriodDescription = periodo || 'Emprego atual / Ativo'
      result.evidenceText = `Trabalhando atualmente na empresa restrita ${empresa || matchedRestricted} (${periodo || 'ativo/atual'}).`
      // Se já achou atual, não precisa sobrescrever com passado
      break
    } else if (hasExplicitEndDate || normPeriodo.length > 0) {
      // Tem término no passado!
      result.hasPastExperienceInRestricted = true
      if (!result.restrictedCompanyName) {
        result.restrictedCompanyName = empresa || matchedRestricted
        result.currentPeriodDescription = periodo
        result.evidenceText = `Experiência passada na empresa ${empresa || matchedRestricted} (${periodo}) — vínculo encerrado, não elimina.`
      }
    } else {
      // Sem datas explícitas nem indicação de atual, mas tem a empresa
      result.hasPastExperienceInRestricted = true
      if (!result.restrictedCompanyName) {
        result.restrictedCompanyName = empresa || matchedRestricted
        result.currentPeriodDescription = periodo || 'Período não especificado'
      }
    }
  }

  return result
}

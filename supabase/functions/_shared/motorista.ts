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
 * Tenta fazer o parse de uma string de data para objeto Date (DD/MM/AA, DD/MM/AAAA, MM/AAAA, AAAA).
 * Anos de dois dígitos (ex: 26) são expandidos considerando o século 2000 (2026).
 */
export function parseDateString(dateStr: string): Date | null {
  if (!dateStr) return null
  const clean = dateStr.trim().replace(/[\.]/g, '/')

  // Formato DD/MM/AAAA ou DD/MM/AA
  const dmyMatch = clean.match(/^([0-3]?\d)\/([0-1]?\d)\/(\d{2,4})$/)
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10)
    const month = parseInt(dmyMatch[2], 10) - 1
    let year = parseInt(dmyMatch[3], 10)
    if (year < 100) {
      // Regra de segurança para anos de dois dígitos no CV:
      // Se year > 50, é 1900+ (ex: 98 -> 1998).
      // Se year <= 50, é 2000+ (ex: 24 -> 2024, 26 -> 2026).
      year += 2000
    }
    const d = new Date(year, month, day, 23, 59, 59)
    if (!isNaN(d.getTime())) return d
  }

  // Formato MM/AAAA ou MM/AA
  const myMatch = clean.match(/^([0-1]?\d)\/(\d{2,4})$/)
  if (myMatch) {
    const month = parseInt(myMatch[1], 10) - 1
    let year = parseInt(myMatch[2], 10)
    if (year < 100) {
      year += 2000
    }
    // Usa o último dia do mês para não reprovar precocemente durante o mês
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate()
    const d = new Date(year, month, lastDayOfMonth, 23, 59, 59)
    if (!isNaN(d.getTime())) return d
  }

  // Formato nome do mês por extenso (ex: "junho de 2026", "jun/2026", "jun 2026")
  const monthNamesMap: Record<string, number> = {
    janeiro: 0,
    jan: 0,
    fevereiro: 1,
    fev: 1,
    marco: 2,
    mar: 2,
    abril: 3,
    abr: 3,
    maio: 4,
    mai: 4,
    junho: 5,
    jun: 5,
    julho: 6,
    jul: 6,
    agosto: 7,
    ago: 7,
    setembro: 8,
    set: 8,
    outubro: 9,
    out: 9,
    novembro: 10,
    nov: 10,
    dezembro: 11,
    dez: 11,
  }
  const textMonthMatch = normalizeText(clean).match(
    /\b(janeiro|jan|fevereiro|fev|marco|mar|abril|abr|maio|mai|junho|jun|julho|jul|agosto|ago|setembro|set|outubro|out|novembro|nov|dezembro|dez)\b(?:\s+(?:de\s+)?|\/)((?:19|20)\d{2}|\d{2})\b/i,
  )
  if (textMonthMatch) {
    const monthIdx = monthNamesMap[textMonthMatch[1].toLowerCase()]
    let year = parseInt(textMonthMatch[2], 10)
    if (year < 100) {
      year += 2000
    }
    const lastDayOfMonth = new Date(year, monthIdx + 1, 0).getDate()
    const d = new Date(year, monthIdx, lastDayOfMonth, 23, 59, 59)
    if (!isNaN(d.getTime())) return d
  }

  // Formato AAAA (ex: 2024, 2026)
  const yMatch = clean.match(/^((?:19|20)\d{2})$/)
  if (yMatch) {
    const year = parseInt(yMatch[1], 10)
    const d = new Date(year, 11, 31, 23, 59, 59)
    if (!isNaN(d.getTime())) return d
  }

  return null
}

/**
 * Extrai e interpreta a data de término de uma string de período.
 * Suporta separadores: "á", "à", "a", "-", "–", "—", "ate", "até", "to".
 * Retorna { parsedEndDate: Date | null, isCurrentWord: boolean }
 */
export function extractPeriodEndDate(periodo: string): {
  parsedEndDate: Date | null
  isCurrentWord: boolean
  hasExplicitEndDate: boolean
} {
  if (!periodo) {
    return { parsedEndDate: null, isCurrentWord: false, hasExplicitEndDate: false }
  }

  const norm = normalizeText(periodo)
  const isCurrentWord =
    /\b(atual|atualmente|presente|present|o momento|ate o momento|ate hoje|trabalhando atualmente|emprego atual|ativo)\b/i.test(
      norm,
    )

  // Separadores que dividem início e término:
  // "15/07/24 á 11/09/26", "15/07/2024 a 11/09/2026", "2021 - 2024", "mai/2021 até abr/2023", "fevereiro de 2023 a junho de 2026"
  const rangeMatch = periodo.match(
    /(?:[0-3]?\d[\/\.\-][0-1]?\d[\/\.\-]\d{2,4}|[0-1]?\d[\/\.\-]\d{2,4}|\b\d{4}\b|[a-zA-ZÀ-ÿ]+\s+(?:de\s+)?\d{4})\s*(?:[aáà\-]|\s+ate\s+|\s+até\s+|\s+a\s+|–|—|\/)\s*([0-3]?\d[\/\.\-][0-1]?\d[\/\.\-]\d{2,4}|[0-1]?\d[\/\.\-]\d{2,4}|\b\d{4}\b|[a-zA-ZÀ-ÿ\s\d]+)/i,
  )

  if (rangeMatch) {
    const endStr = rangeMatch[1].trim()
    const normEndStr = normalizeText(endStr)
    const endIsCurrent =
      /\b(atual|atualmente|presente|present|o momento|ate o momento|ate hoje|trabalhando atualmente|ativo)\b/i.test(
        normEndStr,
      )

    if (endIsCurrent) {
      return { parsedEndDate: null, isCurrentWord: true, hasExplicitEndDate: false }
    }

    const parsed = parseDateString(endStr)
    if (parsed) {
      return { parsedEndDate: parsed, isCurrentWord: false, hasExplicitEndDate: true }
    }
  }

  // Tenta capturar a última data informada no período
  const allDates = periodo.match(
    /\b([0-3]?\d[\/\.\-][0-1]?\d[\/\.\-]\d{2,4}|[0-1]?\d[\/\.\-]\d{2,4}|\b(?:19|20)\d{2}\b)/g,
  )
  if (allDates && allDates.length >= 2) {
    const lastDateStr = allDates[allDates.length - 1]
    const parsed = parseDateString(lastDateStr)
    if (parsed) {
      return { parsedEndDate: parsed, isCurrentWord, hasExplicitEndDate: true }
    }
  }

  return { parsedEndDate: null, isCurrentWord, hasExplicitEndDate: false }
}

/**
 * Avalia se o candidato está ATUALMENTE empregado em empresa restrita vs experiência passada.
 * Regra Permanente: SÓ elimina vínculo ATUAL; experiência passada NÃO elimina!
 * Se a data de término já passou em relação à data atual (hoje), o vínculo é passado -> não elimina.
 */
export function checkRestrictedCompanyStatus(
  cvData: any,
  now: Date = new Date(),
): RestrictedCompanyCheck {
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

    // Interpretar a data de término do período
    const { parsedEndDate, isCurrentWord, hasExplicitEndDate } = extractPeriodEndDate(periodo)

    let isPastByDate = false
    let isFutureByDate = false

    if (parsedEndDate) {
      // REGRA DO RH / SALVAGUARDA DE DATA DE TÉRMINO:
      // Se há uma data de término explícita informada no currículo (mesmo que com ano futuro por erro de digitação/digitação futura),
      // e o texto NÃO diz "atual" / "atualmente" / "presente", trata-se de experiência passada / vínculo com término declarado,
      // não de emprego ativo atual na concorrente.
      // Além disso, se a data de término já passou (< now), o vínculo está comprovadamente encerrado.
      if (parsedEndDate.getTime() < now.getTime()) {
        isPastByDate = true
      } else if (!isAtualExplicit && !isCurrentWord) {
        // Término declarado no currículo sem indicação de "atual": não considerar ativo
        isPastByDate = true
      } else {
        // Data de término futura E traz indicação expressa de vínculo atual
        isFutureByDate = true
      }
    }

    // Só é vínculo ATUAL se:
    // 1) Tem data de término futura OU
    // 2) Traz termo explícito de atual/presente/ativo SEM data de término passada
    // Se a data de término já passou (ou foi um término explícito no passado), NUNCA é vínculo atual!
    const isCurrentlyActive =
      !isPastByDate &&
      (isFutureByDate || ((isAtualExplicit || isCurrentWord) && !hasExplicitEndDate))

    if (isCurrentlyActive) {
      result.isCurrentlyEmployedInRestricted = true
      result.restrictedCompanyName = empresa || matchedRestricted
      result.currentPeriodDescription = periodo || 'Emprego atual / Ativo'
      result.evidenceText = `Trabalhando atualmente na empresa restrita ${empresa || matchedRestricted} (${periodo || 'ativo/atual'}).`
      // Se encontrou emprego atual em empresa restrita, para e retorna (elimina)
      break
    } else {
      // Vínculo passado / encerrado
      result.hasPastExperienceInRestricted = true
      if (!result.restrictedCompanyName) {
        result.restrictedCompanyName = empresa || matchedRestricted
        result.currentPeriodDescription = periodo || 'Experiência passada / vínculo encerrado'
        result.evidenceText = `Experiência passada na empresa restrita ${empresa || matchedRestricted} (${periodo || 'encerrada'}) — vínculo já encerrado, não elimina.`
      }
    }
  }

  return result
}

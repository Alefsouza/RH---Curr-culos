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

    const isLightOrApp =
      isAppOrLightVehicleDriver(fullExpText) ||
      normCargo.includes('uber') ||
      normCargo.includes('99') ||
      normCargo.includes('aplicativo') ||
      normEmpresa.includes('uber') ||
      normEmpresa.includes('99') ||
      normEmpresa.includes('cabify') ||
      normEmpresa.includes('indrive')

    const normEmpresa = normalizeText(empresa)

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

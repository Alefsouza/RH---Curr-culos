import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'
import { corsHeaders } from '../_shared/cors.ts'
import {
  calculateHaversineDistance,
  extractCep,
  formatAddressString,
  geocodeAddress,
  getReferenceCoordsForText,
  isTruncatedOrIncompleteAddress,
  REFERENCE_LOCATIONS,
  Coordinates,
  KNOWN_CEP_COORDS,
} from '../_shared/proximity.ts'
import {
  geocodeNeighborhoodOrIncompleteAddress,
  sanitizeAndRecheckCoordinates,
} from '../_shared/geocode-neighborhood.ts'
import {
  resolveCandidateAge,
  extractBirthDateWithContext,
  isPlausibleBirthDate,
  calculateAgeFromBirthDate,
} from '../_shared/validation.ts'
import { checkBusOrTruckDriverExperience, isAppOrLightVehicleDriver } from '../_shared/motorista.ts'
import {
  isGenericObjective,
  evaluateGenericCandidateAgainstAllVagas,
  inferCandidateRoleFromExperience,
} from '../_shared/criterios-matching.ts'

// Normalização de texto: minúsculas, sem acentos, sem pontuação, espaços simples
function normalizeString(str: string): string {
  if (!str) return ''
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Verifica se uma string de objetivo é especificamente de motorista / condutor
function isMotoristaObjectiveString(str: string): boolean {
  if (!str) return false
  const norm = normalizeString(str)
  if (!norm) return false
  // Excluir expressamente ajudante/auxiliar de motorista do objetivo de motorista
  if (norm.includes('ajudante') || norm.includes('auxiliar')) {
    return false
  }
  // Deve conter palavras como 'motorista', 'condutor', 'carreteiro', 'manobrista', etc.
  return (
    norm.includes('motorista') ||
    norm.includes('condutor') ||
    norm.includes('carreteiro') ||
    norm.includes('transporte coletivo')
  )
}

// Extrai lista padronizada de experiências profissionais do currículo
function getExperiencesList(cvData: any): any[] {
  if (!cvData) return []
  if (Array.isArray(cvData)) return cvData
  if (typeof cvData === 'object' && cvData !== null) {
    if (Array.isArray(cvData.experiencia_profissional)) return cvData.experiencia_profissional
    if (Array.isArray(cvData.experiencias)) return cvData.experiencias
    if (Array.isArray(cvData.historico_profissional)) return cvData.historico_profissional
    if (Array.isArray(cvData.experiencia)) return cvData.experiencia
  }
  return []
}

// Verifica se o candidato possui CNH categoria D ou E comprovada no currículo
function hasCnhCategoriaDouE(cvData: any): boolean {
  if (!cvData) return false

  const checkTextForCnh = (text: string): boolean => {
    if (!text) return false
    const norm = normalizeString(text)
    // Padrões explícitos de CNH D ou E:
    // "cnh d", "cnh e", "cnh ad", "cnh ae", "categoria d", "categoria e", "cat d", "cat e"
    // "habilitacao d", "habilitacao e", "cnh categoria d", "cnh categoria e"
    const hasCategoryD =
      /\b(cnh|categoria|cat|habilitacao)\s*(categoria\s*)?([a-c]*d[a-e]*)\b/.test(norm) ||
      /\bcnh\s*d\b/.test(norm) ||
      /\bcategoria\s*d\b/.test(norm) ||
      /\bcat\s*d\b/.test(norm)
    const hasCategoryE =
      /\b(cnh|categoria|cat|habilitacao)\s*(categoria\s*)?([a-d]*e)\b/.test(norm) ||
      /\bcnh\s*e\b/.test(norm) ||
      /\bcategoria\s*e\b/.test(norm) ||
      /\bcat\s*e\b/.test(norm)

    return hasCategoryD || hasCategoryE
  }

  // Se cvData for string direta
  if (typeof cvData === 'string') {
    return checkTextForCnh(cvData)
  }

  if (typeof cvData === 'object' && cvData !== null) {
    // Campos diretos comuns de CNH
    const directFields = [
      cvData.cnh,
      cvData.categoria_cnh,
      cvData.cnh_categoria,
      cvData.habilitacao,
      cvData.cnh_tipo,
      cvData.tipo_cnh,
    ]
    for (const f of directFields) {
      if (typeof f === 'string') {
        const normF = normalizeString(f)
        if (
          normF.includes('d') ||
          normF.includes('e') ||
          normF.includes('ad') ||
          normF.includes('ae')
        ) {
          return true
        }
      }
    }

    // Verificar em skills/habilidades
    if (Array.isArray(cvData.skills)) {
      for (const s of cvData.skills) {
        if (typeof s === 'string' && checkTextForCnh(s)) return true
      }
    }

    // Resumo ou outros textos
    if (checkTextForCnh(cvData.resumo_cv || cvData.resumo || cvData.perfil || '')) {
      return true
    }
  }

  return false
}

// Verifica se o candidato tem experiência profissional real como motorista ou condução de veículos.
// IMPORTANTE E MANDATÓRIO:
// - Termos de ambiente/empresa (estacionamento, loja, shopping, leve mobilidade, lavador, fiscal, etc.) NÃO contam como condução!
// - "Ajudante de motorista", "auxiliar de motorista", "ajudante de entrega" NÃO é condução (é carga/descarga)!
// - Exige CARGO/FUNÇÃO REAL de condução de veículos (motorista de ônibus, caminhão, van, carreteiro, condutor)
//   OU CNH D/E comprovada.
function hasMotoristaExperience(cvData: any): boolean {
  if (!cvData) return false

  // Se tiver CNH D/E comprovada, qualifica como perfil condutor/motorista
  if (hasCnhCategoriaDouE(cvData)) {
    return true
  }

  const isNonDrivingRole = (text: string): boolean => {
    return (
      text.includes('ajudante') ||
      text.includes('auxiliar') ||
      text.includes('fiscal') ||
      text.includes('lavador') ||
      text.includes('operador de loja') ||
      text.includes('operador de caixa') ||
      text.includes('vigilancia') ||
      text.includes('vigilante') ||
      text.includes('monitoramento') ||
      text.includes('chefe de monitoramento') ||
      text.includes('repositor') ||
      text.includes('balconista') ||
      text.includes('estoquista') ||
      text.includes('atendente') ||
      isAppOrLightVehicleDriver(text)
    )
  }

  // Se cvData for string, analisar o texto por declarações explícitas de cargo
  if (typeof cvData === 'string') {
    const norm = normalizeString(cvData)
    if (
      norm.includes('cargo motorista') ||
      norm.includes('funcao motorista') ||
      norm.includes('motorista de onibus') ||
      norm.includes('motorista coletivo') ||
      norm.includes('motorista de caminhao') ||
      norm.includes('motorista carreteiro') ||
      norm.includes('motorista toco') ||
      norm.includes('motorista truck') ||
      norm.includes('motorista d') ||
      norm.includes('motorista e') ||
      norm.includes('cargo condutor') ||
      norm.includes('funcao condutor')
    ) {
      if (!isNonDrivingRole(norm)) {
        return true
      }
    }
    return false
  }

  // Se for objeto estruturado
  const expList = getExperiencesList(cvData)

  if (Array.isArray(expList)) {
    for (const item of expList) {
      if (typeof item === 'string') {
        const norm = normalizeString(item)
        if (isNonDrivingRole(norm)) {
          continue
        }
        if (
          norm.includes('cargo motorista') ||
          norm.includes('cargo condutor') ||
          norm.includes('motorista de onibus') ||
          norm.includes('motorista de caminhao') ||
          norm.includes('motorista carreteiro')
        ) {
          return true
        }
      } else if (typeof item === 'object' && item !== null) {
        const cargo = normalizeString(item.cargo || item.funcao || item.titulo || item.role || '')
        const desc = normalizeString(item.descricao || item.atividades || item.resumo || '')

        // Se o cargo contém termos explícitos de NÃO-condução (ajudante de motorista, auxiliar, lavador, caixa, etc.)
        // ou de motorista de aplicativo/veículo de passeio (Uber, 99, etc.): NUNCA considerar como motorista de ônibus/caminhão!
        const fullItemText = `${cargo} ${item.empresa || ''} ${desc}`
        if (isNonDrivingRole(cargo) || isAppOrLightVehicleDriver(fullItemText)) {
          continue
        }

        // Verifica estritamente o CARGO/FUNÇÃO: deve ser de condução real de veículos
        const cargoIsMotorista =
          cargo.includes('motorista') ||
          cargo.includes('condutor') ||
          cargo.includes('carreteiro') ||
          cargo.includes('manobrista')

        if (cargoIsMotorista) {
          return true
        }

        // Se o cargo não era motorista (ex: outros cargos),
        // termos genéricos da empresa/ambiente ("Propark Estacionamento", "Leve Mobilidade") NÃO qualificam.
        // Apenas atividades inequívocas e explícitas de condução de ônibus/veículo pesado na descrição,
        // DESDE QUE a descrição não diga "ajudante" ou "carga e descarga":
        if (
          !isNonDrivingRole(desc) &&
          !desc.includes('carga e descarga') &&
          !desc.includes('cargas e descargas') &&
          (desc.includes('conducao de onibus') ||
            desc.includes('conducao de veiculos de grande porte') ||
            desc.includes('transporte coletivo de passageiros') ||
            desc.includes('motorista de onibus') ||
            desc.includes('motorista de caminhao'))
        ) {
          return true
        }
      }
    }
  }

  // Verificar resumo_cv somente por menção inequívoca a ter trabalhado como motorista/condutor
  const resumo = normalizeString(cvData.resumo_cv || cvData.resumo || '')
  if (
    !isNonDrivingRole(resumo) &&
    (resumo.includes('atuou como motorista') ||
      resumo.includes('experiencia como motorista') ||
      resumo.includes('motorista profissional') ||
      resumo.includes('motorista de transporte') ||
      resumo.includes('motorista de onibus'))
  ) {
    return true
  }

  return false
}

// Extrai a idade do candidato (priorizando cálculo por data de nascimento com contexto explícito e sanidade)
function extractCandidateAge(cvData: any): number | null {
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

// Extrai as strings de localização de uma vaga a partir de criterios_qualificacao
function extractVagaLocations(vaga: any): string[] {
  if (!vaga) return []
  const locations: string[] = []
  if (vaga.criterios_qualificacao && typeof vaga.criterios_qualificacao === 'object') {
    const critObj = vaga.criterios_qualificacao
    if (Array.isArray(critObj.localizacoes) && critObj.localizacoes.length > 0) {
      for (const loc of critObj.localizacoes) {
        const parts = [loc.endereco, loc.cidade, loc.estado].filter(
          (p) => p && typeof p === 'string' && p.trim().length > 0,
        )
        if (parts.length > 0) {
          locations.push(parts.join(', '))
        }
      }
    }
  }
  return locations
}

// Escolhe a vaga mais próxima do candidato dentre um conjunto de vagas candidatas
// e avalia se está dentro do raio aceitável da vaga.
async function pickBestVagaByProximity(
  candidateAddressStr: string | null,
  vagasList: any[],
  googleApiKey: string | null,
): Promise<{
  vaga: any
  menorDistanciaKm: number | null
  dentroDoRaio: boolean
  raioMaximoKm: number | null
  metodoGeolocalizacao?: string
}> {
  if (vagasList.length === 0) {
    return {
      vaga: null,
      menorDistanciaKm: null,
      dentroDoRaio: false,
      raioMaximoKm: null,
      metodoGeolocalizacao: 'sem_vagas',
    }
  }

  const getVagaRaio = (vaga: any): number | null => {
    if (vaga?.criterios_qualificacao && typeof vaga.criterios_qualificacao === 'object') {
      return vaga.criterios_qualificacao.raio_km || null
    }
    return null
  }

  // REGRA DE NEGÓCIO MANDATÓRIA:
  // A verificação de proximidade requer geolocalização ou fallback regional seguro.
  // Se não temos endereço do candidato, NÃO atribuir vaga por palpite/acaso.
  if (!candidateAddressStr) {
    if (vagasList.length === 1) {
      const singleVaga = vagasList[0]
      const singleRaio = getVagaRaio(singleVaga)
      return {
        vaga: singleVaga,
        menorDistanciaKm: null,
        dentroDoRaio: true,
        raioMaximoKm: singleRaio,
        metodoGeolocalizacao: 'endereco_ausente_vaga_unica',
      }
    }
    return {
      vaga: null,
      menorDistanciaKm: null,
      dentroDoRaio: false,
      raioMaximoKm: null,
      metodoGeolocalizacao: 'endereco_ausente',
    }
  }

  try {
    let candidateCoords: Coordinates | null = null
    let metodoGeolocalizacao = 'desconhecido'

    const cep = extractCep(candidateAddressStr)
    if (cep && KNOWN_CEP_COORDS[cep]) {
      candidateCoords = KNOWN_CEP_COORDS[cep]
      metodoGeolocalizacao = 'cep_conhecido'
    }

    // Se endereço for só de bairro / incompleto, tentar geocodificação de bairro especializada
    if (!candidateCoords && isTruncatedOrIncompleteAddress(candidateAddressStr)) {
      const geoBairro = await geocodeNeighborhoodOrIncompleteAddress(
        candidateAddressStr,
        googleApiKey,
      )
      if (geoBairro.coords) {
        candidateCoords = geoBairro.coords
        metodoGeolocalizacao = geoBairro.origem || 'geocoding_bairro'
        console.log(
          `[identify-vaga] Bairro geocodificado com sucesso para candidato: "${candidateAddressStr}" (origem: ${metodoGeolocalizacao})`,
        )
      }
    }

    if (!candidateCoords && googleApiKey) {
      candidateCoords = await geocodeAddress(candidateAddressStr, googleApiKey)
      if (candidateCoords) {
        metodoGeolocalizacao = 'geocoding_endereco_completo'
      }
    }

    if (!candidateCoords) {
      console.warn(
        `[identify-vaga] Geocodificação direta indisponível ou falhou para: "${candidateAddressStr}". Tentando fallback por palavras-chave de região...`,
      )
      // Fallback por palavras-chave no texto do endereço do candidato
      candidateCoords = getReferenceCoordsForText(candidateAddressStr)
      if (candidateCoords) {
        metodoGeolocalizacao = 'referencia_textual_bairro'
      }
    }

    if (!candidateCoords) {
      console.warn(
        `[identify-vaga] Geocodificação e fallback regional falharam para: "${candidateAddressStr}". NÃO atribuir vaga por palpite. Deixando candidato sem vaga para posterior análise de critérios/aguardando vaga adequada.`,
      )
      return {
        vaga: null,
        menorDistanciaKm: null,
        dentroDoRaio: false,
        raioMaximoKm: null,
        metodoGeolocalizacao: 'falha_geocodificacao',
      }
    }

    // Cache de coordenadas das localizações das vagas para evitar geocodificação duplicada
    const locationCoordsCache = new Map<string, any>()

    // Pré-carregar referências padrão conhecidas de Cursino e Leste/Sapopemba no cache
    locationCoordsCache.set(
      'Av. do Cursino, 5797, São Paulo, SP, Brasil',
      REFERENCE_LOCATIONS.cursino.approxCoords,
    )
    locationCoordsCache.set(
      'Av. do Cursino, 5797, São Paulo - SP',
      REFERENCE_LOCATIONS.cursino.approxCoords,
    )
    locationCoordsCache.set(
      'Rua Leandro de Sevilha, 95, São Paulo, SP, Brasil',
      REFERENCE_LOCATIONS.sapopemba.approxCoords,
    )
    locationCoordsCache.set(
      'Rua Leandro de Sevilha, 95, São Paulo - SP',
      REFERENCE_LOCATIONS.sapopemba.approxCoords,
    )

    let bestVaga = vagasList[0]
    let bestDist: number | null = null

    for (const vaga of vagasList) {
      const normTitulo = normalizeString(vaga.titulo || '')
      let coords: Coordinates | null = null

      if (normTitulo.includes('cursino')) {
        coords = REFERENCE_LOCATIONS.cursino.approxCoords
      } else if (normTitulo.includes('leste') || normTitulo.includes('sapopemba')) {
        coords = REFERENCE_LOCATIONS.sapopemba.approxCoords
      }

      if (!coords) {
        let vagaLocations = extractVagaLocations(vaga)
        for (const locStr of vagaLocations) {
          coords = locationCoordsCache.get(locStr) || getReferenceCoordsForText(locStr)
          if (coords) break
          if (googleApiKey) {
            coords = await geocodeAddress(locStr, googleApiKey)
            if (coords) {
              locationCoordsCache.set(locStr, coords)
              break
            }
          }
        }
      }

      if (!coords) {
        coords =
          getReferenceCoordsForText(vaga.titulo || '') ||
          getReferenceCoordsForText(vaga.descricao || '')
      }

      if (coords) {
        let dist = calculateHaversineDistance(candidateCoords, coords)

        // SANIDADE (Item 3 do pedido):
        // Se a distância for > 15 km ou divergir, rechecar geocodificação daquele endereço
        if (dist > 15) {
          const sanity = await sanitizeAndRecheckCoordinates(
            candidateAddressStr,
            coords,
            dist,
            googleApiKey,
          )
          if (sanity.distanciaKm !== null && sanity.distanciaKm < dist) {
            console.log(
              `[identify-vaga] Sanidade ajustou distância para "${vaga.titulo}": de ${dist.toFixed(1)} km para ${sanity.distanciaKm.toFixed(1)} km (método: ${sanity.metodoGeolocalizacao})`,
            )
            dist = sanity.distanciaKm
            metodoGeolocalizacao = sanity.metodoGeolocalizacao
            if (sanity.coords) {
              candidateCoords = sanity.coords
            }
          }
        }

        if (bestDist === null || dist < bestDist) {
          bestDist = dist
          bestVaga = vaga
        }
      }
    }

    const raioBest = getVagaRaio(bestVaga)
    const inside = bestDist === null || raioBest === null || bestDist <= raioBest
    return {
      vaga: bestVaga,
      menorDistanciaKm: bestDist !== null ? Number(bestDist.toFixed(2)) : null,
      dentroDoRaio: inside,
      raioMaximoKm: raioBest,
      metodoGeolocalizacao,
    }
  } catch (geoErr: any) {
    console.error('[identify-vaga] Erro ao calcular proximidade:', geoErr?.message)
    return {
      vaga: null,
      menorDistanciaKm: null,
      dentroDoRaio: false,
      raioMaximoKm: null,
      metodoGeolocalizacao: 'erro',
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const bodyText = await req.text()
    let body
    try {
      body = JSON.parse(bodyText)
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Payload inválido.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { candidato_id, user_id, texto_cv, dados_extraidos } = body

    if (!candidato_id && !texto_cv && !dados_extraidos) {
      return new Response(JSON.stringify({ error: 'Faltando candidato_id ou texto/dados do CV' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)
    const googleApiKey = Deno.env.get('GOOGLE_API_KEY') || null

    let cvDataToAnalyze = dados_extraidos || texto_cv
    let parsedDadosExtraidos: any =
      typeof dados_extraidos === 'object' && dados_extraidos !== null ? dados_extraidos : null

    if (!cvDataToAnalyze && candidato_id) {
      const { data: candidato, error: candidatoError } = await supabase
        .from('candidatos')
        .select('dados_extraidos, curriculo_url')
        .eq('id', candidato_id)
        .single()

      if (candidatoError || !candidato) {
        throw new Error('Candidato não encontrado no banco de dados.')
      }
      cvDataToAnalyze = candidato.dados_extraidos
      if (typeof candidato.dados_extraidos === 'object' && candidato.dados_extraidos !== null) {
        parsedDadosExtraidos = candidato.dados_extraidos
      }
    }

    // Fallback determinístico de data_nascimento e idade sobre o texto do CV APENAS com contexto explícito
    if (parsedDadosExtraidos && typeof parsedDadosExtraidos === 'object') {
      let needsSave = false

      // Se não há data_nascimento ou se há texto disponível para buscar contexto explícito
      if (!parsedDadosExtraidos.data_nascimento) {
        const rawTextToSearch =
          typeof texto_cv === 'string' && texto_cv.trim().length > 0
            ? texto_cv
            : typeof parsedDadosExtraidos.resumo_cv === 'string'
              ? parsedDadosExtraidos.resumo_cv
              : null

        if (rawTextToSearch) {
          const extractedBirth = extractBirthDateWithContext(rawTextToSearch)
          if (extractedBirth) {
            parsedDadosExtraidos.data_nascimento = extractedBirth
            needsSave = true
          }
        }
      }

      // Validação de sanidade sobre a data de nascimento encontrada ou existente
      if (parsedDadosExtraidos.data_nascimento) {
        const plausibility = isPlausibleBirthDate(parsedDadosExtraidos.data_nascimento)
        if (!plausibility.valida) {
          console.warn(
            `[identify-vaga-from-cv] Data de nascimento implausível rejeitada: "${parsedDadosExtraidos.data_nascimento}". Motivo: ${plausibility.motivo}`,
          )
          parsedDadosExtraidos.data_nascimento = null
          parsedDadosExtraidos.idade = null
          parsedDadosExtraidos.precisa_revisao = true
          parsedDadosExtraidos.motivo_revisao_idade = plausibility.motivo
          needsSave = true
        } else {
          if (parsedDadosExtraidos.idade !== plausibility.idade) {
            parsedDadosExtraidos.idade = plausibility.idade
            needsSave = true
          }
        }
      } else {
        const calculatedAge = resolveCandidateAge(parsedDadosExtraidos.idade, null)
        if (calculatedAge !== null && parsedDadosExtraidos.idade !== calculatedAge) {
          parsedDadosExtraidos.idade = calculatedAge
          needsSave = true
        } else if (
          calculatedAge === null &&
          parsedDadosExtraidos.idade !== null &&
          parsedDadosExtraidos.idade !== undefined
        ) {
          parsedDadosExtraidos.idade = null
          parsedDadosExtraidos.precisa_revisao = true
          parsedDadosExtraidos.motivo_revisao_idade =
            'Idade declarada fora dos limites plausíveis (14-90 anos)'
          needsSave = true
        }
      }

      if (needsSave && candidato_id) {
        try {
          await supabase
            .from('candidatos')
            .update({ dados_extraidos: parsedDadosExtraidos })
            .eq('id', candidato_id)
          console.log(
            `[identify-vaga-from-cv] data_nascimento/idade validados persistidos para candidato ${candidato_id}: ${parsedDadosExtraidos.data_nascimento} (${parsedDadosExtraidos.idade} anos, precisa_revisao=${Boolean(parsedDadosExtraidos.precisa_revisao)})`,
          )
        } catch (dbErr: any) {
          console.warn(
            '[identify-vaga-from-cv] Erro ao persistir data_nascimento/idade:',
            dbErr?.message,
          )
        }
      }
    }

    // Busca todas as vagas ATIVAS disponíveis no sistema ordenadas por criado_em
    const { data: vagas, error: vagasError } = await supabase
      .from('vagas')
      .select('id, titulo, descricao, criterios_qualificacao, criado_em')
      .eq('ativa', true)
      .order('criado_em', { ascending: true })

    if (vagasError) {
      throw new Error('Erro ao buscar as vagas do sistema.')
    }

    if (!vagas || vagas.length === 0) {
      return new Response(
        JSON.stringify({
          vaga_id: null,
          confianca: 'nenhuma',
          justificativa: 'Nenhuma vaga ativa foi encontrada no sistema.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Extrair o objetivo explícito (se existir nos dados estruturados)
    const rawObjetivo =
      parsedDadosExtraidos?.objetivo ||
      parsedDadosExtraidos?.cargo_pretendido ||
      parsedDadosExtraidos?.cargo ||
      parsedDadosExtraidos?.objetivo_profissional ||
      ''

    const candidatoObjetivo = typeof rawObjetivo === 'string' ? rawObjetivo.trim() : ''

    // Extrair endereço formatado do candidato
    let candidatoEndereco =
      formatAddressString(parsedDadosExtraidos?.endereco, parsedDadosExtraidos) ||
      formatAddressString(parsedDadosExtraidos?.location, parsedDadosExtraidos) ||
      formatAddressString(parsedDadosExtraidos?.cidade, parsedDadosExtraidos) ||
      (typeof parsedDadosExtraidos?.cidade === 'string'
        ? `${parsedDadosExtraidos.cidade}${parsedDadosExtraidos?.estado ? ` - ${parsedDadosExtraidos.estado}` : ''}`
        : null)

    const rawCandidateCep =
      extractCep(candidatoEndereco) ||
      extractCep(parsedDadosExtraidos?.cep) ||
      extractCep(JSON.stringify(parsedDadosExtraidos))
    if (isTruncatedOrIncompleteAddress(candidatoEndereco) && rawCandidateCep) {
      if (!candidatoEndereco || !candidatoEndereco.includes(rawCandidateCep)) {
        candidatoEndereco = candidatoEndereco
          ? `${candidatoEndereco}, CEP ${rawCandidateCep}`
          : `CEP ${rawCandidateCep}`
      }
    }

    // =========================================================================
    // REGRA 1 A 4: AVALIAÇÃO DE CARGOS GENÉRICOS ("TODOS", "DISPOSIÇÃO", VAZIO)
    // Conforme decisão do usuário:
    // (1) candidato com objetivo 'Todos', 'Disposição da Empresa', vazio ou não específico
    //     deve ser avaliado contra TODAS as vagas abertas próximas da garagem dele (dentro do raio de cada uma);
    // (2) fica SOMENTE com a de melhor encaixe nos requisitos básicos (faixa etária, experiência, CNH, escolaridade)
    //     — nunca a primeira por palavra-chave;
    // (3) se não encaixar em nenhuma, NÃO é aprovado em nenhuma — entra como 'Aguardando vaga adequada'
    //     com o cargo pretendido registrado, nunca aprovado por folga;
    // (4) se não estiver perto de nenhuma garagem, descartar de cara com motivo 'Fora do raio de todas as garagens'.
    // =========================================================================
    if (!candidatoObjetivo || isGenericObjective(candidatoObjetivo)) {
      console.log(
        `[identify-vaga-from-cv] Objetivo genérico/vazio detectado: "${candidatoObjetivo || '(vazio)'}". Avaliando contra TODAS as vagas abertas próximas...`,
      )

      const evalData = parsedDadosExtraidos || cvDataToAnalyze || {}
      const genericResult = await evaluateGenericCandidateAgainstAllVagas(
        evalData,
        vagas,
        googleApiKey,
      )

      // Inferir função a partir da experiência profissional
      const expsForInference =
        evalData?.experiencia_profissional ||
        evalData?.experiencias ||
        evalData?.historico_profissional ||
        (Array.isArray(evalData) ? evalData : [])
      const inferredRoleData = inferCandidateRoleFromExperience({
        ...evalData,
        experiencia_profissional: expsForInference,
      })
      const funcaoInferida =
        inferredRoleData.roles.length > 0 ? inferredRoleData.roles.join('/') : null

      // Regra 4: Descartar de cara se fora do raio de todas as garagens
      if (genericResult.foraDeTodasAsGaragens) {
        console.log(
          `[identify-vaga-from-cv] Candidato genérico descartado: fora do raio de todas as garagens ativas. Motivo: Fora do raio de todas as garagens.`,
        )
        return new Response(
          JSON.stringify({
            vaga_id: null,
            confianca: 'baixa',
            descartado: true,
            motivo_descarte: 'Fora do raio de todas as garagens',
            funcao_inferida: funcaoInferida,
            justificativa: genericResult.justificativa,
            todas_avaliacoes: genericResult.rankedEvaluations.map((e) => ({
              vaga_id: e.vaga.id,
              titulo: e.vaga.titulo,
              distancia_km: e.distanciaKm,
              raio_maximo_km: e.raioMaximoKm,
              dentro_do_raio: e.dentroDoRaio,
              score: e.score,
              passou_basicos: e.passouBasicos,
            })),
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // Regra 2: Fica SOMENTE com a de melhor encaixe nos requisitos básicos
      if (genericResult.chosenVaga) {
        console.log(
          `[identify-vaga-from-cv] Candidato genérico alocado na vaga de melhor encaixe: "${genericResult.chosenVaga.titulo}" (ID: ${genericResult.chosenVaga.id})`,
        )
        return new Response(
          JSON.stringify({
            vaga_id: genericResult.chosenVaga.id,
            confianca: 'alta',
            funcao_inferida: funcaoInferida,
            justificativa: genericResult.justificativa,
            todas_avaliacoes: genericResult.rankedEvaluations.map((e) => ({
              vaga_id: e.vaga.id,
              titulo: e.vaga.titulo,
              distancia_km: e.distanciaKm,
              raio_maximo_km: e.raioMaximoKm,
              dentro_do_raio: e.dentroDoRaio,
              score: e.score,
              passou_basicos: e.passouBasicos,
            })),
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // Regra 3: Não encaixou em nenhuma -> Não aprova em nenhuma -> Aguardando vaga adequada
      console.log(
        `[identify-vaga-from-cv] Candidato genérico não atendeu aos requisitos básicos de nenhuma vaga aberta. Entra como Aguardando vaga adequada.`,
      )
      return new Response(
        JSON.stringify({
          vaga_id: null,
          confianca: 'nenhuma',
          aguardando_vaga: true,
          cargo_pretendido: candidatoObjetivo || 'A disposição da empresa',
          funcao_inferida: funcaoInferida,
          justificativa: genericResult.justificativa,
          todas_avaliacoes: genericResult.rankedEvaluations.map((e) => ({
            vaga_id: e.vaga.id,
            titulo: e.vaga.titulo,
            distancia_km: e.distanciaKm,
            raio_maximo_km: e.raioMaximoKm,
            dentro_do_raio: e.dentroDoRaio,
            score: e.score,
            passou_basicos: e.passouBasicos,
            motivos: e.detalhes.motivosNaoEncaixe,
          })),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // =========================================================================
    // REGRA 1.5: CANDIDATO COM OBJETIVO ESPECÍFICO DE MOTORISTA
    // Exemplo real: "Motorista Profissional - Ônibus/Atende/Caminhão/Ambulância"
    // Regra solicitada: Quando o objetivo do candidato for específico de Motorista,
    // avaliar SOMENTE as vagas de Motorista (da garagem mais próxima do candidato),
    // NUNCA colocá-lo em vaga de Cobrador nem em outras áreas.
    // =========================================================================
    if (candidatoObjetivo && isMotoristaObjectiveString(candidatoObjetivo)) {
      console.log(
        `[identify-vaga-from-cv] Objetivo específico de Motorista detectado: "${candidatoObjetivo}". Avaliando SOMENTE vagas de Motorista por proximidade...`,
      )

      const motoristaVagas = vagas.filter((v) =>
        normalizeString(v.titulo || '').includes('motorista'),
      )

      if (motoristaVagas.length > 0) {
        const { vaga: chosenMotoristaVaga, menorDistanciaKm } = await pickBestVagaByProximity(
          candidatoEndereco,
          motoristaVagas,
          googleApiKey,
        )

        if (!chosenMotoristaVaga) {
          return new Response(
            JSON.stringify({
              vaga_id: null,
              confianca: 'baixa',
              aguardando_vaga: true,
              cargo_pretendido: candidatoObjetivo,
              justificativa: `Objetivo do candidato é específico de Motorista ("${candidatoObjetivo}"), mas a localização não pôde ser determinada com segurança para indicar a garagem mais próxima. Aguardando vaga adequada.`,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          )
        }

        let proxText = ''
        if (menorDistanciaKm !== null) {
          proxText = ` Selecionada a garagem mais próxima do endereço do candidato (${candidatoEndereco || 'N/I'}), a aproximadamente ${menorDistanciaKm.toFixed(1)} km.`
        } else if (candidatoEndereco) {
          proxText = ` Endereço do candidato: "${candidatoEndereco}". Selecionada a garagem de Motorista mais compatível.`
        }

        return new Response(
          JSON.stringify({
            vaga_id: chosenMotoristaVaga.id,
            confianca: 'alta',
            justificativa: `Objetivo do candidato é específico de Motorista ("${candidatoObjetivo}"). Pela regra de negócio, foram avaliadas estritamente as vagas de Motorista e selecionada a vaga "${chosenMotoristaVaga.titulo}". NUNCA alocar em vaga de Cobrador.${proxText}`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      } else {
        console.warn(
          `[identify-vaga-from-cv] Objetivo de Motorista "${candidatoObjetivo}", mas não há vagas de Motorista ativas.`,
        )
        return new Response(
          JSON.stringify({
            vaga_id: null,
            confianca: 'nenhuma',
            justificativa: `O objetivo informado pelo candidato é específico de Motorista ("${candidatoObjetivo}"), mas atualmente não há vagas de Motorista ativas no sistema.`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    // =========================================================================
    // REGRA 2: MATCH DIRETO DE OBJETIVO ESPECÍFICO -> TÍTULO DA VAGA
    // Quando houver correspondência, desempatar por endereço se houver múltiplas vagas do mesmo cargo.
    // Se o objetivo for específico e NÃO houver NENHUMA vaga ativa compatível:
    // Retornar vaga_id: null com confianca: 'nenhuma' (NÃO forçar em Cobrador nem passar para fallback IA genérico).
    // REGRA DE MOTORISTA: Se o candidato tem objetivo/pretensão de MOTORISTA, NUNCA atribuir nem desviar para COBRADOR.
    // =========================================================================
    if (candidatoObjetivo && !isGenericObjective(candidatoObjetivo)) {
      const normObjetivo = normalizeString(candidatoObjetivo)
      const stopWords = new Set([
        'de',
        'do',
        'da',
        'dos',
        'das',
        'e',
        'em',
        'para',
        'com',
        'um',
        'uma',
        'a',
        'o',
        'as',
        'os',
        'no',
        'na',
        'nos',
        'nas',
        'ou',
        'por',
        'que',
        'atuar',
        'como',
        'trabalhar',
        'exercer',
        'funcao',
        'cargo',
        'vaga',
        'area',
      ])

      const objWords = normObjetivo
        .split(' ')
        .map((w) => w.trim())
        .filter((w) => w.length >= 3 && !stopWords.has(w))

      if (objWords.length > 0) {
        // Avaliar correspondência com o título de cada vaga e agrupar melhores correspondências
        const matchedVagas: { vaga: any; matchScore: number }[] = []
        let maxScore = 0

        for (const vaga of vagas) {
          const normTitulo = normalizeString(vaga.titulo || '')
          const tituloWords = new Set(
            normTitulo
              .split(' ')
              .map((w) => w.trim())
              .filter((w) => w.length >= 3 && !stopWords.has(w)),
          )

          let score = 0
          // Match de frase exata
          if (normTitulo.includes(normObjetivo) || normObjetivo.includes(normTitulo)) {
            score = 999
          } else {
            // Contagem de palavras-chave coincidentes
            for (const word of objWords) {
              if (tituloWords.has(word) || normTitulo.includes(word)) {
                score++
              }
            }
          }

          if (score > 0) {
            matchedVagas.push({ vaga, matchScore: score })
            if (score > maxScore) {
              maxScore = score
            }
          }
        }

        // REGRA SISTÊMICA (1): SEMPRE avaliar TODAS as vagas da família do cargo do candidato
        // e ficar com a de MELHOR encaixe (distância real menor primeiro) — nunca alocar direto em uma só sem comparar!
        // Extrai a família do cargo (ex: 'abastecedor', 'motorista', 'cobrador', etc.)
        let familyKeywords = [
          'abastecedor',
          'motorista',
          'cobrador',
          'mecanico',
          'eletricista',
          'manutencao',
          'fiscal',
          'auxiliar de limpeza',
          'lavador',
        ]
        let detectedFamily = familyKeywords.find((k) => normObjetivo.includes(k))

        let topMatchedVagas: any[] = []
        if (detectedFamily) {
          // Se identificamos a família no objetivo, pega TODAS as vagas ativas dessa família
          topMatchedVagas = vagas.filter((v) =>
            normalizeString(v.titulo || '').includes(detectedFamily!),
          )
          console.log(
            `[identify-vaga-from-cv] Família detectada: "${detectedFamily}". Encontradas ${topMatchedVagas.length} vagas da mesma família para comparação.`,
          )
        }

        if (topMatchedVagas.length === 0) {
          // Fallback para as vagas empatadas com a maior pontuação de match
          topMatchedVagas = matchedVagas
            .filter((item) => item.matchScore === maxScore)
            .map((item) => item.vaga)
        }

        if (topMatchedVagas.length > 0 && maxScore > 0) {
          const {
            vaga: bestMatchVaga,
            menorDistanciaKm,
            dentroDoRaio,
            raioMaximoKm,
            metodoGeolocalizacao,
          } = await pickBestVagaByProximity(candidatoEndereco, topMatchedVagas, googleApiKey)

          // Se a proximidade não pôde determinar uma vaga segura (ex: falha de geolocalização e sem candidatoCoords)
          if (!bestMatchVaga) {
            console.warn(
              `[identify-vaga-from-cv] Match direto por objetivo "${candidatoObjetivo}", porém proximidade não pôde ser determinada com segurança para o endereço "${candidatoEndereco}". Não atribuir por palpite.`,
            )
            return new Response(
              JSON.stringify({
                vaga_id: null,
                confianca: 'baixa',
                aguardando_vaga: true,
                cargo_pretendido: candidatoObjetivo,
                justificativa: `Candidato tem perfil para "${candidatoObjetivo}", mas a localização ("${candidatoEndereco || 'Não informada'}") não pôde ser verificada por proximidade entre as unidades disponíveis (${topMatchedVagas.map((v) => v.titulo).join(', ')}). Aguardando análise de critérios/revisão humana.`,
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            )
          }

          let proxText = ''
          if (topMatchedVagas.length > 1) {
            if (menorDistanciaKm !== null) {
              proxText = ` Comparação de todas as vagas da família (${topMatchedVagas.map((v) => v.titulo).join(', ')}): escolhida a vaga de melhor encaixe (${bestMatchVaga.titulo}) a ${menorDistanciaKm.toFixed(1)} km do endereço "${candidatoEndereco}" (método: ${metodoGeolocalizacao || 'geolocalizacao'}).`
            } else if (candidatoEndereco) {
              proxText = ` Vagas da mesma família avaliadas (${topMatchedVagas.map((v) => v.titulo).join(', ')}); selecionada a unidade com base no cadastro.`
            }
          }

          // Validar se está dentro do raio aceitável da vaga
          if (!dentroDoRaio && menorDistanciaKm !== null) {
            console.log(
              `[identify-vaga-from-cv] Candidato tem match direto para ${bestMatchVaga.titulo}, mas distância (${menorDistanciaKm.toFixed(1)} km) excede o raio (${raioMaximoKm} km).`,
            )
            return new Response(
              JSON.stringify({
                vaga_id: null,
                confianca: 'baixa',
                distancia_km: menorDistanciaKm,
                raio_maximo_km: raioMaximoKm,
                metodo_geolocalizacao: metodoGeolocalizacao || 'geocodificacao',
                justificativa: `Candidato tem perfil para "${candidatoObjetivo}", mas mora a ${menorDistanciaKm.toFixed(1)} km, excedendo o raio limite de ${raioMaximoKm} km de todas as garagens da família (${topMatchedVagas.map((v) => v.titulo).join(', ')}).`,
                aguardando_vaga: true,
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            )
          }

          console.log(
            `[identify-vaga-from-cv] Match direto por objetivo "${candidatoObjetivo}" com vaga "${bestMatchVaga.titulo}" (ID: ${bestMatchVaga.id}, dist=${menorDistanciaKm} km)`,
          )
          return new Response(
            JSON.stringify({
              vaga_id: bestMatchVaga.id,
              confianca: 'alta',
              distancia_km: menorDistanciaKm,
              metodo_geolocalizacao: metodoGeolocalizacao || 'geocodificacao',
              justificativa: `Vaga identificada comparando todas as vagas da família "${detectedFamily || candidatoObjetivo}". Selecionada "${bestMatchVaga.titulo}".${proxText}`,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          )
        }

        // O candidato possui um objetivo específico e NÃO houve correspondência com os títulos das vagas ativas.
        // REGRA DE NEGÓCIO MANDATÓRIA (Item 2 da especificação):
        // Candidato com objetivo específico sem vaga aberta (ex.: Funileiro, Pintor, Eletricista, Soldador etc.)
        // NUNCA deve ser empurrado para Cobrador nem para outra vaga aleatória!
        // Entra como "Aguardando vaga adequada" com o cargo pretendido registrado e visível (vaga_id: null).
        console.log(
          `[identify-vaga-from-cv] Objetivo específico informado ("${candidatoObjetivo}") não possui vaga aberta correspondente no sistema. Candidato entra como "Aguardando vaga adequada" com o cargo pretendido registrado. NUNCA empurrar para Cobrador.`,
        )

        return new Response(
          JSON.stringify({
            vaga_id: null,
            confianca: 'nenhuma',
            aguardando_vaga: true,
            cargo_pretendido: candidatoObjetivo,
            justificativa: `Candidato possui objetivo específico para "${candidatoObjetivo}", porém atualmente não há vaga aberta para este cargo no sistema. O candidato foi colocado em "Aguardando vaga adequada" preservando seu cargo pretendido.`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    // =========================================================================
    // REGRA 3: FALLBACK OPENAI COM CRITÉRIOS + ENDEREÇOS (para objetivos específicos não contemplados acima)
    // =========================================================================
    const openaiKey = Deno.env.get('OPENAI_KEY') || Deno.env.get('OPENIA_KEY')
    if (!openaiKey) {
      throw new Error('Chave da API da OpenAI não configurada.')
    }

    const openai = new OpenAI({ apiKey: openaiKey })

    const isRetryableError = (error: any) => {
      const status = error?.status || error?.statusCode || error?.response?.status
      if (status === 429) return true
      if (typeof status === 'number' && status >= 500 && status < 600) return true
      const msg = String(error?.message || '').toLowerCase()
      if (
        msg.includes('rate limit') ||
        msg.includes('429') ||
        msg.includes('timeout') ||
        msg.includes('fetch failed')
      ) {
        return true
      }
      return false
    }

    const callOpenAIWithRetry = async (
      promptText: string,
      retries = 3,
      delays = [2000, 4000, 8000],
    ): Promise<any> => {
      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'Você é um especialista em Recrutamento e Seleção de RH focado em análise técnica de currículos e Job Matching. Selecione a vaga solicitada ou a vaga em que o candidato melhor se encaixa, considerando estritamente o objetivo, histórico profissional, os critérios de qualificação e os endereços/localizações de cada vaga.',
            },
            { role: 'user', content: promptText },
          ],
          response_format: { type: 'json_object' },
        })
        return JSON.parse(response.choices[0].message.content || '{}')
      } catch (error: any) {
        if (retries > 0 && isRetryableError(error)) {
          const delay = delays[3 - retries] ?? 8000
          console.log(
            `Erro OpenAI em identify-vaga. Retentando em ${delay}ms... (${retries} restantes)`,
          )
          await new Promise((res) => setTimeout(res, delay))
          return callOpenAIWithRetry(promptText, retries - 1, delays)
        }
        throw error
      }
    }

    // Preparar lista de vagas com critérios detalhados e localizações
    const vagasListSummary = vagas.map((v) => {
      let criteriosTexto = 'Não especificado'
      let localizacoes: any[] = []
      let raioKm = 0

      if (v.criterios_qualificacao && typeof v.criterios_qualificacao === 'object') {
        criteriosTexto =
          v.criterios_qualificacao.texto_livre || JSON.stringify(v.criterios_qualificacao)
        localizacoes = v.criterios_qualificacao.localizacoes || []
        raioKm = v.criterios_qualificacao.raio_km || 0
      } else if (typeof v.criterios_qualificacao === 'string') {
        criteriosTexto = v.criterios_qualificacao
      }

      return {
        id: v.id,
        titulo: v.titulo,
        descricao: v.descricao,
        criterios_texto: criteriosTexto,
        localizacoes: localizacoes,
        raio_km: raioKm,
      }
    })

    const prompt = `
      Temos o seguinte currículo / dados do candidato:
      ${typeof cvDataToAnalyze === 'string' ? cvDataToAnalyze : JSON.stringify(cvDataToAnalyze)}

      Endereço identificado do candidato: ${candidatoEndereco || 'Não informado'}

      E temos as seguintes vagas abertas (com seus IDs, critérios de qualificação e localizações):
      ${JSON.stringify(vagasListSummary)}

      Sua tarefa é analisar o currículo e identificar em qual dessas vagas o candidato melhor se encaixa, levando em consideração os CRITÉRIOS DE QUALIFICAÇÃO E OS ENDEREÇOS/LOCALIZAÇÕES que cada vaga solicita.
      
      REGRAS CRÍTICAS DE MATCHING (SIGA RIGOROSAMENTE NA ORDEM):

      1. REGRA ESPECIAL DE OBJETIVO GENÉRICO ("A disposição da empresa", "Qualquer vaga", etc.):
         Se o candidato informar objetivo como "À disposição da empresa", "Disposição da empresa", "Qualquer vaga", "Sem preferência", "O que precisar" ou expressar genericamente disponibilidade:
         - ANALISE O HISTÓRICO PROFISSIONAL: Se o candidato tem cargo de Motorista, experiência na condução de veículos de passageiros/ônibus ou CNH D/E no histórico: ATRIBUA À VAGA DE MOTORISTA DA GARAGEM MAIS PRÓXIMA do endereço do candidato (Cursino ou Leste).
         - FAIXA ETÁRIA: As vagas de Cobrador exigem idade entre 18 e 56 anos. Se o candidato tiver mais de 56 anos (ex: 57, 58 anos ou mais), NUNCA o atribua para Cobrador caso haja vaga de Motorista ou outra vaga compatível onde não há limite de idade.
         - Se não tiver experiência e tiver entre 18 e 56 anos, pode ser atribuído a Cobrador.
         - Confiança deve ser "alta".

      2. CANDIDATO COM OBJETIVO ESPECÍFICO SEM VAGA ABERTA (EX: FUNILEIRO, PINTOR, SOLDADOR, SERRALHEIRO, AUXILIAR ADMINISTRATIVO ETC.):
         - REGRA RIGOROSA: NUNCA empurre para Cobrador nem para outra vaga arbitrária!
         - Se o candidato expressou cargo pretendido específico e não existe vaga aberta para tal especialidade, RETORNE vaga_id como null, confianca como "nenhuma" e explique na justificativa que o candidato fica "Aguardando vaga adequada" com o cargo pretendido registrado.

      3. ATRIBUIÇÃO POR ENCAIXE / REQUISITOS (NÃO APENAS PALAVRA-CHAVE):
         - Antes de associar qualquer vaga, confira se o candidato atende aos REQUISITOS BÁSICOS (faixa etária, escolaridade, CNH e experiência mínima exigida nos critérios da vaga).
         - Priorize a função com melhor encaixe entre as vagas abertas.
         - Se o candidato não atender aos requisitos básicos da vaga, NÃO force a atribuição nela.

      4. PRIORIDADE MOTORISTA SOBRE COBRADOR E REGRA DE NÃO RECLASSIFICAÇÃO / NÃO REBAIXAMENTO:
         - Se o candidato expressar objetivo para MOTORISTA ou tiver perfil/histórico voltado para Motorista (ou possuir CNH D/E, experiência como motorista, etc.): ATRIBUA À VAGA DE MOTORISTA (escolhendo a unidade mais próxima).
         - NUNCA reclassifique, desvie ou realoque um candidato a MOTORISTA para a vaga de COBRADOR caso ele necessite de revisão, falte algum comprovante ou o resultado seja "revisar". O candidato de Motorista DEVE permanecer vinculado à vaga de Motorista para revisão humana da Paola.
         - Se o perfil ou qualificações do candidato atenderem/forem compatíveis tanto com a vaga de Motorista quanto com a vaga de Cobrador, DÊ RIGOROSA PRIORIDADE PARA A VAGA DE MOTORISTA (escolhendo a unidade de Motorista mais próxima do endereço do candidato).
         - EXCEÇÃO: Apenas atribua Cobrador se o candidato colocou expressamente como objetivo único/pretendido "Cobrador" (e não tenha histórico de motorista/idade impeditiva).

      4. HISTÓRICO PROFISSIONAL, CRITÉRIOS DA VAGA E REGRAS DE ESCOLARIDADE / CURSOS / GÊNERO:
         - REGRA CONDICIONAL AO GÊNERO (ex: "Mulheres apenas se tiver categoria D na CNH"): Se os critérios de uma vaga (como Cobrador) contêm regra condicional ao gênero feminino exigindo CNH D, mulheres sem CNH D não são compatíveis com a vaga. Para homens na vaga de Cobrador, NÃO verificar nem exigir CNH — a ausência de CNH ou de dados de CNH em candidato homem NUNCA deve ser impeditiva.
         - ESCOLARIDADE: Ensino Fundamental incompleto ou completo considera também Ensino Médio e Superior. Se a vaga exige Ensino Fundamental, candidatos com Ensino Médio ou Superior atendem ao requisito.
         - CURSOS DE TRANSPORTE COLETIVO: Considere qualquer curso relativo a transporte coletivo e considere também quando constar "Credencial de Transporte Coletivo" como curso/formação.
         - CRITÉRIOS EXPLÍCITOS: Continue considerando os critérios explícitos de cada vaga (ex: exigência de CNH categoria D ou E para Motorista). As novas regras não podem sobrepor um critério explícito da vaga.
         - Avalie também a compatibilidade de endereço/localização com as unidades das vagas.

      5. NENHUMA VAGA COMPATÍVEL:
         Se nenhuma vaga fizer sentido para a profissão/perfil do candidato, retorne vaga_id como null e confianca como "nenhuma".            Retorne ESTRITAMENTE um JSON com a seguinte estrutura:
      {
        "vaga_id": "UUID da vaga correspondente ou null",
        "confianca": "alta", "media", "baixa" ou "nenhuma",
        "justificativa": "Explicação concisa citando a vaga escolhida, os critérios considerados e o fator de endereço/proximidade avaliado."
      }
    `

    const result = await callOpenAIWithRetry(prompt)

    // Se confiança for nenhuma, zera vaga_id
    if (result.confianca === 'nenhuma') {
      result.vaga_id = null
    }

    // Se a IA escolheu uma vaga de uma família (ex: Cobrador ou Motorista),
    // validar se a vaga escolhida é a da garagem MAIS PRÓXIMA do endereço do candidato
    if (result.vaga_id) {
      const selectedVaga = vagas.find((v) => v.id === result.vaga_id)
      if (selectedVaga) {
        const normTitle = normalizeString(selectedVaga.titulo || '')
        let sameFamilyVagas: any[] = []
        if (normTitle.includes('cobrador')) {
          sameFamilyVagas = vagas.filter((v) =>
            normalizeString(v.titulo || '').includes('cobrador'),
          )
        } else if (normTitle.includes('motorista')) {
          sameFamilyVagas = vagas.filter((v) =>
            normalizeString(v.titulo || '').includes('motorista'),
          )
        } else if (normTitle.includes('abastecedor')) {
          sameFamilyVagas = vagas.filter((v) =>
            normalizeString(v.titulo || '').includes('abastecedor'),
          )
        }

        if (sameFamilyVagas.length > 1) {
          const {
            vaga: closerVaga,
            menorDistanciaKm,
            dentroDoRaio,
            raioMaximoKm,
            metodoGeolocalizacao,
          } = await pickBestVagaByProximity(candidatoEndereco, sameFamilyVagas, googleApiKey)

          if (closerVaga) {
            result.distancia_km = menorDistanciaKm
            result.metodo_geolocalizacao = metodoGeolocalizacao || 'geocodificacao'
            if (!dentroDoRaio && menorDistanciaKm !== null) {
              console.log(
                `[identify-vaga-from-cv] Família compatível identificada, mas nenhuma garagem dentro do raio (${menorDistanciaKm.toFixed(1)} km > ${raioMaximoKm} km).`,
              )
              result.vaga_id = null
              result.confianca = 'baixa'
              result.justificativa = `Candidato compatível com a função (${selectedVaga.titulo}), mas distância até a garagem mais próxima (${closerVaga.titulo}, ${menorDistanciaKm.toFixed(1)} km) excede o raio de ${raioMaximoKm} km.`
            } else if (closerVaga.id !== result.vaga_id) {
              console.log(
                `[identify-vaga-from-cv] Ajustando vaga da mesma família por proximidade: de "${selectedVaga.titulo}" para "${closerVaga.titulo}" (${menorDistanciaKm} km, método: ${metodoGeolocalizacao}).`,
              )
              result.vaga_id = closerVaga.id
              result.justificativa = `${result.justificativa || ''} Garagem ajustada para "${closerVaga.titulo}" por estar mais próxima do endereço (${menorDistanciaKm?.toFixed(1)} km, método: ${metodoGeolocalizacao}).`
            }
          }
        }
      }
    }

    // GUARDA DE SEGURANÇA: Se o objetivo do candidato era de MOTORISTA OU se o candidato possui histórico REAL de MOTORISTA (ou CNH D/E)
    // mas a IA retornou Cobrador, impedir a realocação para Cobrador e redirecionar para a vaga de Motorista mais próxima.
    if (result.vaga_id) {
      const targetVaga = vagas.find((v) => v.id === result.vaga_id)
      const normTargetTitle = normalizeString(targetVaga?.titulo || '')
      const isMotoristaObjective = isMotoristaObjectiveString(candidatoObjetivo)
      const candidatoTemExpMotorista = hasMotoristaExperience(
        parsedDadosExtraidos || cvDataToAnalyze,
      )
      const candidateAge = extractCandidateAge(parsedDadosExtraidos)
      const foraIdadeCobrador = candidateAge !== null && (candidateAge < 18 || candidateAge > 56)

      if (normTargetTitle.includes('cobrador')) {
        if (isMotoristaObjective || candidatoTemExpMotorista || foraIdadeCobrador) {
          console.log(
            `[identify-vaga-from-cv] Salvaguarda acionada: candidato foi associado a Cobrador, mas atende a condições para Motorista (objetivo=${isMotoristaObjective}, expMotorista=${candidatoTemExpMotorista}, idade=${candidateAge}). Revertendo para Motorista por proximidade.`,
          )
          const motoristaVagas = vagas.filter((v) =>
            normalizeString(v.titulo || '').includes('motorista'),
          )
          if (motoristaVagas.length > 0) {
            const { vaga: motoristaVaga } = await pickBestVagaByProximity(
              candidatoEndereco,
              motoristaVagas,
              googleApiKey,
            )
            if (motoristaVaga) {
              result.vaga_id = motoristaVaga.id
              result.confianca = 'alta'
              result.justificativa = isMotoristaObjective
                ? `Candidato possui objetivo de Motorista ("${candidatoObjetivo}"). Pela regra de negócio, permanece estritamente vinculado à vaga de Motorista ("${motoristaVaga.titulo}") para avaliação/revisão humana caso necessário, sem realocação para Cobrador.`
                : `Candidato possui histórico como Motorista / critérios incompatíveis com Cobrador (idade ${candidateAge || 'N/I'}). Pela regra de negócio, foi direcionado à vaga de Motorista da garagem mais próxima ("${motoristaVaga.titulo}").`
            } else {
              result.vaga_id = null
              result.confianca = 'nenhuma'
              result.aguardando_vaga = true
              result.justificativa = `Candidato com perfil de Motorista, mas não foi possível definir a unidade mais próxima por proximidade.`
            }
          }
        }
      } else if (normTargetTitle.includes('motorista')) {
        // Se a IA escolheu Motorista, mas o candidato NÃO tem objetivo de Motorista, NÃO tem histórico de Motorista e NÃO tem CNH D/E comprovada:
        // Excluir expressamente termos como "ajudante", "estacionamento", "leve mobilidade", "lavador", "fiscal", "operador de loja" como evidência de condução.
        // Se a IA sugerir Motorista e o candidato não passar no crivo estrito, reverter automaticamente para a vaga de Cobrador da garagem mais próxima,
        // validando faixa 18-56 anos somente quando a idade existir (se null, segue sem validar idade).
        if (!isMotoristaObjective && !candidatoTemExpMotorista) {
          const candidateAgeForCheck = extractCandidateAge(parsedDadosExtraidos)
          const isAgeOkCobrador =
            candidateAgeForCheck === null ||
            (candidateAgeForCheck >= 18 && candidateAgeForCheck <= 56)

          if (isAgeOkCobrador) {
            // Se o objetivo do candidato era específico para outra área (ex: Mecânica, Pintura, etc.), NUNCA empurrar para Cobrador!
            if (candidatoObjetivo && !isGenericObjective(candidatoObjetivo)) {
              result.vaga_id = null
              result.confianca = 'nenhuma'
              result.justificativa = `Candidato não possui requisitos de Motorista e seu objetivo pretendido é "${candidatoObjetivo}". Sem vaga correspondente aberta, entra em "Aguardando vaga adequada".`
            } else {
              const cobradorVagas = vagas.filter((v) =>
                normalizeString(v.titulo || '').includes('cobrador'),
              )
              if (cobradorVagas.length > 0) {
                const {
                  vaga: cobradorVaga,
                  dentroDoRaio,
                  menorDistanciaKm,
                  raioMaximoKm,
                } = await pickBestVagaByProximity(candidatoEndereco, cobradorVagas, googleApiKey)
                console.log(
                  `[identify-vaga-from-cv] Salvaguarda anti-falso-motorista acionada: IA associou a Motorista ("${targetVaga?.titulo}"), mas candidato NÃO possui cargo real de condução nem CNH D/E. Objetivo genérico direcionado para Cobrador.`,
                )
                if (cobradorVaga && (dentroDoRaio || menorDistanciaKm === null)) {
                  result.vaga_id = cobradorVaga.id
                  result.confianca = 'alta'
                  result.justificativa = `Candidato não possui condução real nem CNH D/E para Motorista. Com objetivo geral/genérico, direcionado para Cobrador ("${cobradorVaga.titulo}").`
                } else {
                  result.vaga_id = null
                  result.confianca = 'nenhuma'
                  result.justificativa = `Candidato não possui perfil de Motorista e a vaga de Cobrador mais próxima excede o raio limite.`
                }
              } else {
                result.vaga_id = null
                result.confianca = 'nenhuma'
                result.justificativa =
                  'Candidato não possui condução real nem CNH D/E para a vaga de Motorista, e não há vaga compatível aberta.'
              }
            }
          } else {
            // Se a idade existe e é comprovadamente fora da faixa de Cobrador (<18 ou >56), não colocar em Cobrador
            result.vaga_id = null
            result.confianca = 'nenhuma'
            result.justificativa = `Candidato não possui perfil de Motorista (sem condução real/CNH D/E) e possui idade (${candidateAgeForCheck} anos) fora da faixa etária de 18 a 56 anos para Cobrador.`
          }
        }
      } else if (isMotoristaObjective && !normTargetTitle.includes('motorista')) {
        // Se o objetivo é especificamente de Motorista, NUNCA pode ser associado a outra vaga não-Motorista
        console.log(
          `[identify-vaga-from-cv] Salvaguarda acionada: candidato com objetivo de Motorista foi associado a "${targetVaga?.titulo}". Revertendo para Motorista por proximidade.`,
        )
        const motoristaVagas = vagas.filter((v) =>
          normalizeString(v.titulo || '').includes('motorista'),
        )
        if (motoristaVagas.length > 0) {
          const {
            vaga: motoristaVaga,
            dentroDoRaio,
            menorDistanciaKm,
            raioMaximoKm,
          } = await pickBestVagaByProximity(candidatoEndereco, motoristaVagas, googleApiKey)
          if (motoristaVaga && (dentroDoRaio || menorDistanciaKm === null)) {
            result.vaga_id = motoristaVaga.id
            result.confianca = 'alta'
            result.justificativa = `Candidato possui objetivo específico de Motorista ("${candidatoObjetivo}"). Vinculado à vaga de Motorista ("${motoristaVaga.titulo}").`
          } else {
            result.vaga_id = null
            result.confianca = 'nenhuma'
            result.aguardando_vaga = true
            result.justificativa = motoristaVaga
              ? `Candidato possui objetivo de Motorista, mas mora a ${menorDistanciaKm?.toFixed(1)} km, excedendo o raio limite (${raioMaximoKm} km) de todas as garagens.`
              : `Candidato possui objetivo de Motorista, mas a localização não pôde ser determinada para vincular com segurança a uma garagem. Aguardando vaga adequada.`
          }
        }
      }
    } else {
      // Se a IA não encontrou vaga e o candidato tem objetivo específico sem vaga aberta:
      // Mantém vaga_id = null e aguardando vaga adequada, SEM empurrar para Cobrador.
      if (candidatoObjetivo && !isGenericObjective(candidatoObjetivo)) {
        result.vaga_id = null
        result.confianca = 'nenhuma'
        result.aguardando_vaga = true
        result.cargo_pretendido = candidatoObjetivo
        result.justificativa = `Candidato com objetivo "${candidatoObjetivo}" não possui vaga ativa correspondente no momento. Aguardando vaga adequada.`
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('Erro na identify-vaga-from-cv:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

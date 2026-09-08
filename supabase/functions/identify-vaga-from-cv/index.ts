import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'
import { corsHeaders } from '../_shared/cors.ts'
import {
  calculateHaversineDistance,
  formatAddressString,
  geocodeAddress,
  getReferenceCoordsForText,
  REFERENCE_LOCATIONS,
} from '../_shared/proximity.ts'
import { resolveCandidateAge } from '../_shared/validation.ts'

// Padrões de objetivo genérico (normalizados sem acento)
const GENERIC_OBJECTIVE_PATTERNS = [
  'a disposicao da empresa',
  'a disposicao',
  'disposicao da empresa',
  'disposicao',
  'qualquer vaga',
  'qualquer area',
  'sem preferencia',
  'disponivel para qualquer',
  'disponivel para qualquer area',
  'disponivel para qualquer funcao',
  'disponivel para qualquer vaga',
  'o que a empresa precisar',
  'o que precisar',
  'qualquer funcao',
  'qualquer cargo',
  'area a definir',
  'cargo a definir',
  'a combinar',
  'em aberto',
  'a criterio da empresa',
]

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

// Verifica se uma string de objetivo é genérica
function isGenericObjective(str: string): boolean {
  if (!str) return false
  const norm = normalizeString(str)
  if (!norm) return false
  return GENERIC_OBJECTIVE_PATTERNS.some((pattern) => {
    const normPattern = normalizeString(pattern)
    return norm === normPattern || norm.includes(normPattern) || normPattern.includes(norm)
  })
}

// Verifica se uma string de objetivo é especificamente de motorista / condutor
function isMotoristaObjectiveString(str: string): boolean {
  if (!str) return false
  const norm = normalizeString(str)
  if (!norm) return false
  // Deve conter palavras como 'motorista', 'condutor', 'carreteiro', 'manobrista', etc.
  return (
    norm.includes('motorista') ||
    norm.includes('condutor') ||
    norm.includes('motor apoio') ||
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

// Verifica se o candidato tem experiência profissional real como motorista ou condução de veículos
// IMPORTANTE: Termos de ambiente (estacionamento, loja, shopping, leve mobilidade) NÃO contam como motorista!
// Exige CARGO/FUNÇÃO de condução (motorista, condutor, carreteiro, manobrista) OU CNH D/E comprovada.
function hasMotoristaExperience(cvData: any): boolean {
  if (!cvData) return false

  // Se tiver CNH D/E comprovada, qualifica como perfil condutor/motorista
  if (hasCnhCategoriaDouE(cvData)) {
    return true
  }

  // Se cvData for string, analisar o texto por declarações explícitas de cargo
  if (typeof cvData === 'string') {
    const norm = normalizeString(cvData)
    return (
      norm.includes('cargo motorista') ||
      norm.includes('funcao motorista') ||
      norm.includes('motorista de onibus') ||
      norm.includes('motorista coletivo') ||
      norm.includes('motor apoio') ||
      norm.includes('motorista carreteiro') ||
      norm.includes('motorista toco') ||
      norm.includes('motorista truck') ||
      norm.includes('motorista d') ||
      norm.includes('motorista e') ||
      norm.includes('cargo condutor') ||
      norm.includes('funcao condutor')
    )
  }

  // Se for objeto estruturado
  const expList = getExperiencesList(cvData)

  if (Array.isArray(expList)) {
    for (const item of expList) {
      if (typeof item === 'string') {
        const norm = normalizeString(item)
        if (
          norm.includes('cargo motorista') ||
          norm.includes('cargo condutor') ||
          norm.includes('motorista de onibus') ||
          norm.includes('motorista carreteiro') ||
          norm.includes('motor apoio')
        ) {
          return true
        }
      } else if (typeof item === 'object' && item !== null) {
        const cargo = normalizeString(item.cargo || item.funcao || item.titulo || item.role || '')
        const desc = normalizeString(item.descricao || item.atividades || item.resumo || '')

        // Verifica estritamente o CARGO/FUNÇÃO: deve ser de condução de veículos
        const cargoIsMotorista =
          cargo.includes('motorista') ||
          cargo.includes('condutor') ||
          cargo.includes('motor apoio') ||
          cargo.includes('carreteiro') ||
          cargo.includes('manobrista')

        if (cargoIsMotorista) {
          return true
        }

        // Se o cargo não era motorista (ex: "Operador de Caixa", "Vigilante", "Operador de loja"),
        // termos genéricos da empresa/ambiente ("Propark Estacionamento", "Leve Mobilidade") NÃO qualificam.
        // Apenas atividades inequívocas e explícitas de condução de ônibus/veículo pesado na descrição:
        if (
          desc.includes('conducao de onibus') ||
          desc.includes('conducao de veiculos de grande porte') ||
          desc.includes('transporte coletivo de passageiros') ||
          desc.includes('motorista de onibus') ||
          desc.includes('motorista de caminhao')
        ) {
          return true
        }
      }
    }
  }

  // Verificar resumo_cv somente por menção inequívoca a ter trabalhado como motorista/condutor
  const resumo = normalizeString(cvData.resumo_cv || cvData.resumo || '')
  if (
    resumo.includes('atuou como motorista') ||
    resumo.includes('experiencia como motorista') ||
    resumo.includes('motorista profissional') ||
    resumo.includes('motorista de transporte') ||
    resumo.includes('motorista de onibus')
  ) {
    return true
  }

  return false
}

// Extrai a idade do candidato (priorizando cálculo por data de nascimento)
function extractCandidateAge(cvData: any): number | null {
  if (!cvData) return null
  return resolveCandidateAge(cvData.idade, cvData.data_nascimento)
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
async function pickBestVagaByProximity(
  candidateAddressStr: string | null,
  vagasList: any[],
  googleApiKey: string | null,
): Promise<{ vaga: any; menorDistanciaKm: number | null }> {
  if (vagasList.length === 0) {
    return { vaga: null, menorDistanciaKm: null }
  }
  if (vagasList.length === 1) {
    return { vaga: vagasList[0], menorDistanciaKm: null }
  }

  // Se não temos endereço do candidato ou apiKey do Google, tenta fallback textual ou retorna a primeira vaga
  if (!candidateAddressStr || !googleApiKey) {
    if (candidateAddressStr) {
      const fallbackRef = getReferenceCoordsForText(candidateAddressStr)
      if (fallbackRef) {
        // Encontra a vaga mais compatível com essa coordenada de referência
        let bestVaga = vagasList[0]
        let bestDist: number | null = null
        for (const vaga of vagasList) {
          const vagaRef =
            getReferenceCoordsForText(vaga.titulo || '') ||
            getReferenceCoordsForText(vaga.descricao || '')
          if (vagaRef) {
            const dist = calculateHaversineDistance(fallbackRef, vagaRef)
            if (bestDist === null || dist < bestDist) {
              bestDist = dist
              bestVaga = vaga
            }
          }
        }
        return { vaga: bestVaga, menorDistanciaKm: bestDist }
      }
    }
    return { vaga: vagasList[0], menorDistanciaKm: null }
  }

  try {
    let candidateCoords = await geocodeAddress(candidateAddressStr, googleApiKey)
    if (!candidateCoords) {
      console.warn(
        `[identify-vaga] Não foi possível geocodificar endereço do candidato: "${candidateAddressStr}". Tentando fallback por palavras-chave de região...`,
      )
      // Fallback por palavras-chave no texto do endereço do candidato
      candidateCoords = getReferenceCoordsForText(candidateAddressStr)
    }

    if (!candidateCoords) {
      console.warn(
        `[identify-vaga] Geocodificação e fallback falharam para: "${candidateAddressStr}". Usando primeira vaga.`,
      )
      return { vaga: vagasList[0], menorDistanciaKm: null }
    }

    // Cache de coordenadas das localizações das vagas para evitar geocodificação duplicada
    const locationCoordsCache = new Map<string, any>()

    let bestVaga = vagasList[0]
    let bestDist: number | null = null

    for (const vaga of vagasList) {
      let vagaLocations = extractVagaLocations(vaga)

      // Fallback: se a vaga não tiver localizacoes no criterios_qualificacao, inferir pelo título (Leste -> Sapopemba, Cursino -> Cursino)
      if (vagaLocations.length === 0) {
        const normTitulo = normalizeString(vaga.titulo || '')
        if (normTitulo.includes('cursino')) {
          vagaLocations = ['Av. do Cursino, 5797, São Paulo - SP']
        } else if (normTitulo.includes('leste') || normTitulo.includes('sapopemba')) {
          vagaLocations = ['Rua Leandro de Sevilha, 95, São Paulo - SP']
        }
      }

      // Se ainda assim não houver localizações, tenta obter coordenadas diretamente por palavras-chave do título/descrição
      if (vagaLocations.length === 0) {
        const directCoords =
          getReferenceCoordsForText(vaga.titulo || '') ||
          getReferenceCoordsForText(vaga.descricao || '')
        if (directCoords) {
          const dist = calculateHaversineDistance(candidateCoords, directCoords)
          if (bestDist === null || dist < bestDist) {
            bestDist = dist
            bestVaga = vaga
          }
        }
        continue
      }

      for (const locStr of vagaLocations) {
        let coords = locationCoordsCache.get(locStr)
        if (!coords) {
          coords = await geocodeAddress(locStr, googleApiKey)
          // Se a geocodificação da string falhar (ex: endereço mal formatado ou erro na API),
          // NÃO descartar a vaga: usar as coordenadas de referência baseadas em palavras-chave no endereço ou título/descrição da vaga
          if (!coords) {
            const fallbackRef =
              getReferenceCoordsForText(locStr) ||
              getReferenceCoordsForText(vaga.titulo || '') ||
              getReferenceCoordsForText(vaga.descricao || '')
            if (fallbackRef) {
              console.warn(
                `[identify-vaga] Geocodificação falhou para localização "${locStr}". Usando coordenadas de referência de fallback.`,
              )
              coords = fallbackRef
            }
          }

          if (coords) {
            locationCoordsCache.set(locStr, coords)
          }
        }

        if (coords) {
          const dist = calculateHaversineDistance(candidateCoords, coords)
          if (bestDist === null || dist < bestDist) {
            bestDist = dist
            bestVaga = vaga
          }
        }
      }
    }

    return { vaga: bestVaga, menorDistanciaKm: bestDist }
  } catch (geoErr: any) {
    console.error('[identify-vaga] Erro ao calcular proximidade:', geoErr?.message)
    return { vaga: vagasList[0], menorDistanciaKm: null }
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
    const candidatoEndereco =
      formatAddressString(parsedDadosExtraidos?.endereco) ||
      formatAddressString(parsedDadosExtraidos?.location) ||
      formatAddressString(parsedDadosExtraidos?.cidade) ||
      (typeof parsedDadosExtraidos?.cidade === 'string'
        ? `${parsedDadosExtraidos.cidade}${parsedDadosExtraidos?.estado ? ` - ${parsedDadosExtraidos.estado}` : ''}`
        : null)

    // =========================================================================
    // REGRA 1: DETECÇÃO DE "OBJETIVO GENÉRICO" ("A disposição da empresa", etc.)
    // Se o objetivo for genérico, considerar TAMBÉM a experiência profissional do candidato:
    // - Se possui experiência/cargo de Motorista no histórico, deve ser candidatado à vaga de
    //   MOTORISTA da garagem mais próxima do endereço dele.
    // - As vagas de Cobrador exigem idade 18-56 anos; um candidato com idade > 56 ou que tenha
    //   experiência de motorista NUNCA deve ser mandado para Cobrador quando existe a alternativa de Motorista.
    // - Só recorrer à vaga de Cobrador se não houver vaga de Motorista compatível ou se ele não tiver perfil de Motorista.
    // =========================================================================
    if (candidatoObjetivo && isGenericObjective(candidatoObjetivo)) {
      console.log(
        `[identify-vaga-from-cv] Objetivo genérico detectado: "${candidatoObjetivo}". Analisando histórico profissional e critérios...`,
      )

      const candidatoTemExpMotorista = hasMotoristaExperience(
        parsedDadosExtraidos || cvDataToAnalyze,
      )
      const idadeCandidato = extractCandidateAge(parsedDadosExtraidos)
      const motoristaVagas = vagas.filter((v) =>
        normalizeString(v.titulo || '').includes('motorista'),
      )
      const cobradorVagas = vagas.filter((v) =>
        normalizeString(v.titulo || '').includes('cobrador'),
      )

      // Se possui experiência como Motorista e existem vagas de Motorista disponíveis:
      if (candidatoTemExpMotorista && motoristaVagas.length > 0) {
        console.log(
          `[identify-vaga-from-cv] Candidato com objetivo genérico ("${candidatoObjetivo}") possui histórico de Motorista. Direcionando para vaga de Motorista da garagem mais próxima.`,
        )

        const { vaga: chosenMotoristaVaga, menorDistanciaKm } = await pickBestVagaByProximity(
          candidatoEndereco,
          motoristaVagas,
          googleApiKey,
        )

        let proxText = ''
        if (menorDistanciaKm !== null) {
          proxText = ` Selecionada a vaga de Motorista da garagem mais próxima do endereço do candidato (${candidatoEndereco}), a aproximadamente ${menorDistanciaKm.toFixed(1)} km.`
        } else if (candidatoEndereco) {
          proxText = ` Endereço do candidato: "${candidatoEndereco}". Selecionada a garagem mais adequada.`
        } else {
          proxText = ' Não foi identificado endereço no currículo para desempate geográfico.'
        }

        return new Response(
          JSON.stringify({
            vaga_id: chosenMotoristaVaga.id,
            confianca: 'alta',
            justificativa: `Objetivo do candidato é genérico ("${candidatoObjetivo}"), mas o histórico profissional comprova experiência como Motorista. Pela regra de negócio, foi priorizada a vaga de Motorista ("${chosenMotoristaVaga.titulo}").${proxText}`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // Se NÃO tem experiência de motorista, verificar compatibilidade com Cobrador (faixa etária 18-56 anos)
      // Se a idade for conhecida e for maior que 56 anos ou menor que 18, NÃO direcionar para Cobrador
      const foraFaixaEtariaCobrador =
        idadeCandidato !== null && (idadeCandidato < 18 || idadeCandidato > 56)

      if (foraFaixaEtariaCobrador && motoristaVagas.length > 0) {
        // Candidato fora da faixa etária de Cobrador, mas há vagas de Motorista abertas (onde não há teto de 56 anos)
        console.log(
          `[identify-vaga-from-cv] Candidato tem ${idadeCandidato} anos (fora da faixa de 18-56 anos para Cobrador). Avaliando vaga de Motorista por proximidade.`,
        )
        const { vaga: chosenMotoristaVaga, menorDistanciaKm } = await pickBestVagaByProximity(
          candidatoEndereco,
          motoristaVagas,
          googleApiKey,
        )

        let proxText = ''
        if (menorDistanciaKm !== null) {
          proxText = ` Selecionada a vaga de Motorista da garagem mais próxima (${menorDistanciaKm.toFixed(1)} km) do endereço (${candidatoEndereco}).`
        }

        return new Response(
          JSON.stringify({
            vaga_id: chosenMotoristaVaga.id,
            confianca: 'alta',
            justificativa: `Objetivo genérico ("${candidatoObjetivo}"). Como a idade do candidato (${idadeCandidato} anos) não atende ao limite de até 56 anos das vagas de Cobrador, foi direcionado para a vaga de Motorista ("${chosenMotoristaVaga.titulo}").${proxText}`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // Caso padrão para objetivo genérico (candidato sem histórico específico de motorista e dentro da faixa etária)
      if (cobradorVagas.length > 0 && !foraFaixaEtariaCobrador) {
        const { vaga: chosenVaga, menorDistanciaKm } = await pickBestVagaByProximity(
          candidatoEndereco,
          cobradorVagas,
          googleApiKey,
        )

        let proxText = ''
        if (menorDistanciaKm !== null) {
          proxText = ` Selecionada a unidade mais próxima do endereço do candidato (${candidatoEndereco}), a aproximadamente ${menorDistanciaKm.toFixed(1)} km.`
        } else if (candidatoEndereco) {
          proxText = ` Endereço do candidato: "${candidatoEndereco}".`
        } else {
          proxText = ' Não foi identificado endereço no currículo para desempate geográfico.'
        }

        return new Response(
          JSON.stringify({
            vaga_id: chosenVaga.id,
            confianca: 'alta',
            justificativa: `Objetivo do candidato identificado como "${candidatoObjetivo}" (disposição da empresa/genérico). Pela regra de negócio, foi direcionado para a vaga de Cobrador ("${chosenVaga.titulo}").${proxText}`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
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

        // Filtra as vagas empatadas com a maior pontuação de match
        const topMatchedVagas = matchedVagas
          .filter((item) => item.matchScore === maxScore)
          .map((item) => item.vaga)

        if (topMatchedVagas.length > 0 && maxScore > 0) {
          const { vaga: bestMatchVaga, menorDistanciaKm } = await pickBestVagaByProximity(
            candidatoEndereco,
            topMatchedVagas,
            googleApiKey,
          )

          let proxText = ''
          if (topMatchedVagas.length > 1) {
            if (menorDistanciaKm !== null) {
              proxText = ` Desempate por proximidade entre as opções (${topMatchedVagas.map((v) => v.titulo).join(', ')}): escolhida a vaga mais próxima (${menorDistanciaKm.toFixed(1)} km) do endereço "${candidatoEndereco}".`
            } else if (candidatoEndereco) {
              proxText = ` Vagas com mesmo cargo disponíveis (${topMatchedVagas.map((v) => v.titulo).join(', ')}); selecionada a unidade com base no cadastro.`
            }
          }

          console.log(
            `[identify-vaga-from-cv] Match direto por objetivo "${candidatoObjetivo}" com vaga "${bestMatchVaga.titulo}" (ID: ${bestMatchVaga.id})`,
          )
          return new Response(
            JSON.stringify({
              vaga_id: bestMatchVaga.id,
              confianca: 'alta',
              justificativa: `Vaga identificada com alta prioridade devido à correspondência direta entre o objetivo do candidato ("${candidatoObjetivo}") e a vaga ("${bestMatchVaga.titulo}").${proxText}`,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          )
        }

        // O candidato possui um objetivo específico e NÃO houve correspondência com os títulos das vagas ativas.
        // Regra de negócio solicitada: quando o objetivo for específico mas não houver vaga ativa correspondente,
        // usar a experiência profissional como fallback para escolher a vaga mais compatível
        // (ex.: experiência de frentista/abastecimento -> Abastecedor da garagem mais próxima; motorista -> Motorista mais próxima)
        // em vez de retornar imediatamente "sem vaga compatível".
        console.log(
          `[identify-vaga-from-cv] Objetivo específico "${candidatoObjetivo}" não possui vaga ativa correspondente direta. Avaliando fallback por experiência profissional...`,
        )

        const fallbackExperiences = getExperiencesList(parsedDadosExtraidos || cvDataToAnalyze)

        if (fallbackExperiences.length > 0) {
          // Extrair palavras-chave dos cargos do histórico profissional
          const expKeywords: { text: string; role: string }[] = []
          for (const item of fallbackExperiences) {
            const cargo =
              typeof item === 'string' ? item : item.cargo || item.funcao || item.titulo || ''
            const desc =
              typeof item === 'object' && item !== null
                ? item.descricao || item.atividades || item.resumo || ''
                : ''
            if (cargo) expKeywords.push({ text: normalizeString(`${cargo} ${desc}`), role: cargo })
          }

          // Mapeamento direto de famílias/áreas conhecidas por experiência profissional:
          // REGRAS RIGOROSAS:
          // - A associação deve ser pelos CARGOS REAIS do histórico (ex.: Operador de Caixa, Atendimento, Cobrança, Vigilância de loja etc. -> Cobrador)
          // - Termos de ambiente/setor (estacionamento, loja, leve mobilidade, shopping) NÃO devem ser interpretados como Motorista!
          // - Motorista SOMENTE se houver cargo/função de condução de veículos no histórico OU CNH categoria D/E comprovada no currículo.
          // - Respeitar a restrição de idade 18-56 anos das vagas de Cobrador.

          // 1. Motorista -> SOMENTE com cargo/função de condução real OU CNH D/E comprovada
          const hasMotoristaExp = hasMotoristaExperience(parsedDadosExtraidos || cvDataToAnalyze)

          // 2. Abastecimento / Frentista -> Família Abastecedor (preservar)
          const hasAbastecimentoExp = expKeywords.some(
            (k) =>
              k.text.includes('frentista') ||
              k.text.includes('abastecedor') ||
              k.text.includes('abastecimento') ||
              k.text.includes('posto de gasolina') ||
              k.text.includes('posto de combustivel') ||
              k.text.includes('lubrificador') ||
              k.text.includes('troca de oleo'),
          )

          // 3. Mecânico / Manutenção mecânica -> Família Mecânico (preservar)
          const hasMecanicaExp = expKeywords.some(
            (k) =>
              k.text.includes('mecanico') ||
              k.text.includes('mecanica') ||
              k.text.includes('auto eletrico') ||
              k.text.includes('diesel'),
          )

          // 4. Cobrador / Operador de Caixa / Atendimento / Cobrança / Vigilância de loja / Balconista
          // Verifica cargos reais no histórico profissional ou nas skills
          const candidateAgeForFallback = extractCandidateAge(parsedDadosExtraidos)
          const isAgeCompatibleWithCobrador =
            candidateAgeForFallback === null ||
            (candidateAgeForFallback >= 18 && candidateAgeForFallback <= 56)

          const hasCobradorExp = expKeywords.some((k) => {
            const roleNorm = normalizeString(k.role)
            const textNorm = k.text
            return (
              roleNorm.includes('cobrador') ||
              roleNorm.includes('bilheteiro') ||
              roleNorm.includes('fiscal de catraca') ||
              roleNorm.includes('operador de caixa') ||
              roleNorm.includes('caixa') ||
              roleNorm.includes('atendimento') ||
              roleNorm.includes('cobranca') ||
              roleNorm.includes('vigilancia') ||
              roleNorm.includes('vigilante') ||
              roleNorm.includes('operador de loja') ||
              roleNorm.includes('balconista') ||
              roleNorm.includes('fiscal de loja') ||
              textNorm.includes('operador de caixa') ||
              textNorm.includes('atendimento ao cliente') ||
              textNorm.includes('operar caixa')
            )
          })

          let fallbackVagasGroup: any[] = []
          let fallbackFamilyName = ''
          let fallbackRoleMentioned = ''

          // Verificar vagas de mecânico ativas
          const mecanicoVagas = vagas.filter((v) => {
            const t = normalizeString(v.titulo || '')
            return t.includes('mecanico') && !t.includes('jovem aprendiz')
          })

          if (hasMotoristaExp) {
            fallbackVagasGroup = vagas.filter((v) =>
              normalizeString(v.titulo || '').includes('motorista'),
            )
            fallbackFamilyName = 'Motorista'
            fallbackRoleMentioned = 'Motorista'
          } else if (hasAbastecimentoExp) {
            fallbackVagasGroup = vagas.filter((v) =>
              normalizeString(v.titulo || '').includes('abastecedor'),
            )
            fallbackFamilyName = 'Abastecedor'
            const expMatch = expKeywords.find(
              (k) =>
                k.text.includes('frentista') ||
                k.text.includes('abastece') ||
                k.text.includes('posto'),
            )
            fallbackRoleMentioned = expMatch?.role || 'Frentista / Abastecimento'
          } else if (hasMecanicaExp && mecanicoVagas.length > 0) {
            fallbackVagasGroup = mecanicoVagas
            fallbackFamilyName = 'Mecânico'
            const expMatch = expKeywords.find(
              (k) => k.text.includes('mecanic') || k.text.includes('diesel'),
            )
            fallbackRoleMentioned = expMatch?.role || 'Mecânica'
          } else if (hasCobradorExp && isAgeCompatibleWithCobrador) {
            fallbackVagasGroup = vagas.filter((v) =>
              normalizeString(v.titulo || '').includes('cobrador'),
            )
            fallbackFamilyName = 'Cobrador'
            const expMatch = expKeywords.find(
              (k) =>
                k.text.includes('caixa') ||
                k.text.includes('atendimento') ||
                k.text.includes('cobranca') ||
                k.text.includes('vigil') ||
                k.text.includes('loja') ||
                k.text.includes('cobrador') ||
                k.text.includes('bilheteiro'),
            )
            fallbackRoleMentioned = expMatch?.role || 'Operador de Caixa / Atendimento'
          }

          if (fallbackVagasGroup.length > 0) {
            const { vaga: chosenFallbackVaga, menorDistanciaKm } = await pickBestVagaByProximity(
              candidatoEndereco,
              fallbackVagasGroup,
              googleApiKey,
            )

            let proxText = ''
            if (menorDistanciaKm !== null) {
              proxText = ` Selecionada a garagem mais próxima do endereço do candidato (${candidatoEndereco || 'N/I'}), a aproximadamente ${menorDistanciaKm.toFixed(1)} km.`
            } else if (candidatoEndereco) {
              proxText = ` Endereço do candidato: "${candidatoEndereco}". Selecionada a unidade mais compatível.`
            }

            console.log(
              `[identify-vaga-from-cv] Fallback por experiência acionado: objetivo era "${candidatoObjetivo}", mas experiência profissional em "${fallbackRoleMentioned}" direcionou para a vaga "${chosenFallbackVaga.titulo}" (ID: ${chosenFallbackVaga.id}).`,
            )

            return new Response(
              JSON.stringify({
                vaga_id: chosenFallbackVaga.id,
                confianca: 'media',
                justificativa: `O objetivo informado pelo candidato ("${candidatoObjetivo}") não possui vaga aberta correspondente. Utilizada a experiência profissional como fallback ("${fallbackRoleMentioned}"), direcionando para a vaga de ${fallbackFamilyName} ("${chosenFallbackVaga.titulo}").${proxText}`,
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            )
          }
        }

        // Se o fallback heurístico por palavras-chave diretas não encontrou grupo específico,
        // não retornar null aqui: deixar fluir para a REGRA 3 (Fallback OpenAI com critérios e histórico profissional),
        // que agora está instruída a usar a experiência profissional como fallback quando não houver vaga para o cargo pretendido.
        console.log(
          `[identify-vaga-from-cv] Fallback heurístico direto não encontrou correspondência inequívoca. Encaminhando para fallback semântico com histórico profissional (Regra 3)...`,
        )
      }
    }

    // =========================================================================
    // REGRA 3: FALLBACK OPENAI COM CRITÉRIOS + ENDEREÇOS + REGRA DO COBRADOR
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
         - Só atribua a vaga de Cobrador para objetivo genérico se o candidato NÃO possuir histórico de Motorista e tiver idade compatível (18 a 56 anos).
         - Confiança deve ser "alta".

      2. OBJETIVO / CARGO PRETENDIDO ESPECÍFICO QUE NÃO TEM VAGA ABERTA (REGRA DE FALLBACK NA EXPERIÊNCIA):
         - Quando o objetivo do candidato for específico mas não houver vaga ativa correspondente ao cargo (ex: objetivo "Lavador", "Auxiliar Geral" etc. e não há vaga correspondente aberta):
         - NUNCA descarte imediatamente como "sem vaga compatível" se o candidato possuir EXPERIÊNCIA PROFISSIONAL em áreas correspondentes a alguma vaga ativa aberta no sistema.
         - USE A EXPERIÊNCIA PROFISSIONAL COMO FALLBACK para escolher a vaga mais compatível seguindo RIGOROSAMENTE as regras abaixo:
           * CARGOS REAIS: A associação da experiência deve ser feita estritamente pelos CARGOS REAIS do histórico profissional (Operador de Caixa, Atendimento, Cobrança, Vigilância de loja, Operador de loja, Balconista, Balcão etc.) -> ATRIBUA À VAGA DE COBRADOR DA GARAGEM MAIS PRÓXIMA (respeitando a restrição de idade de 18 a 56 anos das vagas de Cobrador).
           * TERMOS DE AMBIENTE NÃO SÃO MOTORISTA: Termos de ambiente/setor/empresa como "estacionamento", "loja", "leve mobilidade", "shopping", "garagem", "pátio" NÃO devem ser interpretados como experiência de Motorista! Ter trabalhado como Caixa ou Vigilante em um estacionamento (ex: Propark Estacionamento / Leve Mobilidade) NÃO É experiência de motorista.
           * MOTORISTA SOMENTE SE: Vaga de Motorista SOMENTE se houver cargo/função real de condução de veículos no histórico (ex: "motorista", "condutor", "carreteiro") OU CNH categoria D/E comprovada no currículo. Se NÃO houver comprovação de condução nem CNH D/E, NUNCA atribua vaga de Motorista nem envie para revisão de Motorista.
           * FRENTISTA / ABASTECIMENTO: Se a experiência corresponder a frentista, posto de combustíveis, troca de óleo ou abastecimento -> ATRIBUA À VAGA DE ABASTECEDOR DA GARAGEM MAIS PRÓXIMA pelo endereço do candidato.
           * MECÂNICA: Se a experiência for em mecânica automotiva / pesada / diesel -> ATRIBUA À VAGA DE MECÂNICO DA GARAGEM MAIS PRÓXIMA (ou Motorista se tiver CNH e condução).
         - ATENÇÃO: NUNCA force em Cobrador um candidato com objetivo específico a menos que ele tenha experiência correspondente e idade compatível.
         - Se e somente se o candidato NÃO possuir nenhuma experiência profissional compatível com as vagas ativas abertas: retorne vaga_id como null, confianca como "nenhuma" e justificativa clara explicando que não há vaga aberta nem para o cargo pretendido nem compatível com a experiência.

      3. PRIORIDADE MOTORISTA SOBRE COBRADOR E REGRA DE NÃO RECLASSIFICAÇÃO / NÃO REBAIXAMENTO:
         - Se o candidato expressar objetivo para MOTORISTA ou tiver perfil/histórico voltado para Motorista (ou possuir CNH D/E, experiência como motorista, etc.): ATRIBUA À VAGA DE MOTORISTA (escolhendo a unidade mais próxima).
         - NUNCA reclassifique, desvie ou realoque um candidato a MOTORISTA para a vaga de COBRADOR caso ele necessite de revisão, falte algum comprovante ou o resultado seja "revisar". O candidato de Motorista DEVE permanecer vinculado à vaga de Motorista para revisão humana da Paola.
         - Se o perfil ou qualificações do candidato atenderem/forem compatíveis tanto com a vaga de Motorista quanto com a vaga de Cobrador, DÊ RIGOROSA PRIORIDADE PARA A VAGA DE MOTORISTA (escolhendo a unidade de Motorista mais próxima do endereço do candidato).
         - EXCEÇÃO: Apenas atribua Cobrador se o candidato colocou expressamente como objetivo único/pretendido "Cobrador" (e não tenha histórico de motorista/idade impeditiva).

      4. HISTÓRICO PROFISSIONAL, CRITÉRIOS DA VAGA E REGRAS DE ESCOLARIDADE / CURSOS / GÊNERO:
         - REGRA CONDICIONAL AO GÊNERO (ex: "Mulheres apenas se tiver categoria D na CNH"): Se os critérios de uma vaga (como Cobrador) contêm regra condicional ao gênero feminino exigindo CNH D, mulheres sem CNH D não são compatíveis com a vaga. Homens NÃO entram nessa regra e NÃO devem ter CNH D exigida para essa vaga.
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
            result.vaga_id = motoristaVaga.id
            result.confianca = 'alta'
            result.justificativa = isMotoristaObjective
              ? `Candidato possui objetivo de Motorista ("${candidatoObjetivo}"). Pela regra de negócio, permanece estritamente vinculado à vaga de Motorista ("${motoristaVaga.titulo}") para avaliação/revisão humana caso necessário, sem realocação para Cobrador.`
              : `Candidato possui histórico como Motorista / critérios incompatíveis com Cobrador (idade ${candidateAge || 'N/I'}). Pela regra de negócio, foi direcionado à vaga de Motorista da garagem mais próxima ("${motoristaVaga.titulo}").`
          }
        }
      } else if (normTargetTitle.includes('motorista')) {
        // Se a IA escolheu Motorista, mas o candidato NÃO tem objetivo de Motorista, NÃO tem histórico de Motorista e NÃO tem CNH D/E comprovada:
        // Verificar se ele tem histórico de Cobrador / Caixa / Atendimento e idade compatível (como no caso Henrique Amâncio),
        // corrigindo qualquer alucinação de associar termos de ambiente (estacionamento, loja, leve mobilidade) a Motorista!
        if (!isMotoristaObjective && !candidatoTemExpMotorista) {
          const candidateAgeForCheck = extractCandidateAge(parsedDadosExtraidos)
          const isAgeOkCobrador =
            candidateAgeForCheck === null ||
            (candidateAgeForCheck >= 18 && candidateAgeForCheck <= 56)

          const allExpList = getExperiencesList(parsedDadosExtraidos || cvDataToAnalyze)
          const hasCaixaOrAtendimentoExp = allExpList.some((item: any) => {
            const c = normalizeString(
              typeof item === 'string' ? item : item.cargo || item.funcao || item.titulo || '',
            )
            const d =
              typeof item === 'object' && item !== null
                ? normalizeString(item.descricao || item.atividades || item.resumo || '')
                : ''
            return (
              c.includes('caixa') ||
              c.includes('atendimento') ||
              c.includes('cobranca') ||
              c.includes('vigil') ||
              c.includes('loja') ||
              c.includes('cobrador') ||
              c.includes('bilheteiro') ||
              c.includes('balconista') ||
              d.includes('operador de caixa') ||
              d.includes('atendimento ao cliente')
            )
          })

          if (hasCaixaOrAtendimentoExp && isAgeOkCobrador) {
            const cobradorVagas = vagas.filter((v) =>
              normalizeString(v.titulo || '').includes('cobrador'),
            )
            if (cobradorVagas.length > 0) {
              const { vaga: cobradorVaga, menorDistanciaKm } = await pickBestVagaByProximity(
                candidatoEndereco,
                cobradorVagas,
                googleApiKey,
              )
              console.log(
                `[identify-vaga-from-cv] Salvaguarda anti-falso-motorista acionada: IA associou erroneamente a Motorista ("${targetVaga?.titulo}"), mas candidato não tem cargo de condução nem CNH D/E. Possui experiência em Caixa/Atendimento/Loja. Redirecionando para Cobrador ("${cobradorVaga.titulo}").`,
              )
              result.vaga_id = cobradorVaga.id
              result.confianca = 'alta'
              result.justificativa = `Candidato não possui experiência em condução de veículos nem CNH D/E comprovada. O histórico profissional comprova atuação em Operador de Caixa / Atendimento / Loja, sendo direcionado para a vaga de Cobrador da garagem mais próxima ("${cobradorVaga.titulo}").`
            }
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
          const { vaga: motoristaVaga } = await pickBestVagaByProximity(
            candidatoEndereco,
            motoristaVagas,
            googleApiKey,
          )
          result.vaga_id = motoristaVaga.id
          result.confianca = 'alta'
          result.justificativa = `Candidato possui objetivo específico de Motorista ("${candidatoObjetivo}"). Vinculado à vaga de Motorista ("${motoristaVaga.titulo}").`
        }
      }
    } else {
      // Se result.vaga_id foi null (OpenAI não associou nenhuma vaga), verificar se podemos aplicar o fallback de experiência
      const candidateHasExpMotorista = hasMotoristaExperience(
        parsedDadosExtraidos || cvDataToAnalyze,
      )
      const allExperiences = getExperiencesList(parsedDadosExtraidos || cvDataToAnalyze)
      const allExpTexts = allExperiences
        .map((item: any) => {
          const c = typeof item === 'string' ? item : item.cargo || item.funcao || item.titulo || ''
          const d =
            typeof item === 'object' && item !== null
              ? item.descricao || item.atividades || item.resumo || ''
              : ''
          return normalizeString(`${c} ${d}`)
        })
        .join(' ')

      if (candidateHasExpMotorista) {
        const motoristaVagas = vagas.filter((v) =>
          normalizeString(v.titulo || '').includes('motorista'),
        )
        if (motoristaVagas.length > 0) {
          const { vaga: motoristaVaga } = await pickBestVagaByProximity(
            candidatoEndereco,
            motoristaVagas,
            googleApiKey,
          )
          result.vaga_id = motoristaVaga.id
          result.confianca = 'media'
          result.justificativa = `Candidato possui objetivo sem vaga aberta ("${candidatoObjetivo || 'N/I'}"), mas o histórico profissional comprova experiência como Motorista ou CNH D/E. Direcionado para a vaga de Motorista da garagem mais próxima ("${motoristaVaga.titulo}").`
        }
      } else if (
        allExpTexts.includes('frentista') ||
        allExpTexts.includes('abastecedor') ||
        allExpTexts.includes('abastecimento') ||
        allExpTexts.includes('posto de gasolina') ||
        allExpTexts.includes('posto de combustivel')
      ) {
        const abastecedorVagas = vagas.filter((v) =>
          normalizeString(v.titulo || '').includes('abastecedor'),
        )
        if (abastecedorVagas.length > 0) {
          const { vaga: chosenAbastecedor } = await pickBestVagaByProximity(
            candidatoEndereco,
            abastecedorVagas,
            googleApiKey,
          )
          result.vaga_id = chosenAbastecedor.id
          result.confianca = 'media'
          result.justificativa = `Candidato possui objetivo sem vaga aberta ("${candidatoObjetivo || 'N/I'}"), mas o histórico profissional comprova experiência em posto/abastecimento (Frentista). Direcionado para a vaga de Abastecedor da garagem mais próxima ("${chosenAbastecedor.titulo}").`
        }
      } else if (
        allExpTexts.includes('caixa') ||
        allExpTexts.includes('atendimento') ||
        allExpTexts.includes('cobranca') ||
        allExpTexts.includes('vigil') ||
        allExpTexts.includes('loja') ||
        allExpTexts.includes('cobrador') ||
        allExpTexts.includes('bilheteiro') ||
        allExpTexts.includes('balconista')
      ) {
        const candidateAge = extractCandidateAge(parsedDadosExtraidos)
        const isAgeCompatible = candidateAge === null || (candidateAge >= 18 && candidateAge <= 56)
        if (isAgeCompatible) {
          const cobradorVagas = vagas.filter((v) =>
            normalizeString(v.titulo || '').includes('cobrador'),
          )
          if (cobradorVagas.length > 0) {
            const { vaga: chosenCobrador } = await pickBestVagaByProximity(
              candidatoEndereco,
              cobradorVagas,
              googleApiKey,
            )
            result.vaga_id = chosenCobrador.id
            result.confianca = 'media'
            result.justificativa = `Candidato possui objetivo sem vaga aberta ("${candidatoObjetivo || 'N/I'}"), mas o histórico profissional comprova experiência em atendimento/caixa/loja. Direcionado para a vaga de Cobrador da garagem mais próxima ("${chosenCobrador.titulo}").`
          }
        }
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

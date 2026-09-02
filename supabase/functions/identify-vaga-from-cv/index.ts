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

  // Se não temos endereço do candidato ou apiKey do Google, retorna a primeira vaga (ordem de criação/query)
  if (!candidateAddressStr || !googleApiKey) {
    return { vaga: vagasList[0], menorDistanciaKm: null }
  }

  try {
    const candidateCoords = await geocodeAddress(candidateAddressStr, googleApiKey)
    if (!candidateCoords) {
      console.warn(
        `[identify-vaga] Não foi possível geocodificar endereço do candidato: "${candidateAddressStr}". Usando primeira vaga.`,
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
    // Prioridade para vagas de Cobrador com desempate por endereço / proximidade.
    // =========================================================================
    if (candidatoObjetivo && isGenericObjective(candidatoObjetivo)) {
      console.log(
        `[identify-vaga-from-cv] Objetivo genérico detectado: "${candidatoObjetivo}". Aplicando preferência para Cobrador.`,
      )

      // Filtrar vagas cujo título contenha "cobrador"
      const cobradorVagas = vagas.filter((v) =>
        normalizeString(v.titulo || '').includes('cobrador'),
      )

      if (cobradorVagas.length > 0) {
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
            justificativa: `Objetivo do candidato identificado como "${candidatoObjetivo}" (disposição da empresa/genérico). Pela regra de negócio, foi dada preferência à vaga de Cobrador ("${chosenVaga.titulo}").${proxText}`,
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
        // Regra de negócio: Se o cargo pretendido é específico e não existe vaga aberta para ele, NÃO DEVE forçar em Cobrador nem em outra vaga incompatível.
        console.log(
          `[identify-vaga-from-cv] Objetivo específico "${candidatoObjetivo}" não possui vaga ativa correspondente no sistema. Retornando vaga_id: null.`,
        )
        return new Response(
          JSON.stringify({
            vaga_id: null,
            confianca: 'nenhuma',
            justificativa: `O objetivo informado pelo candidato é específico ("${candidatoObjetivo}"), mas atualmente não há vagas ativas disponíveis para este cargo no sistema.`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
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

      1. REGRA ESPECIAL DE OBJETIVO GENÉRICO ("A disposição da empresa" ou semelhante):
         Se o candidato informar objetivo como "À disposição da empresa", "Disposição da empresa", "Qualquer vaga", "Sem preferência", "O que precisar" ou expressar genericamente disponibilidade:
         - DÊ PREFERÊNCIA PARA A VAGA DE COBRADOR (ex: "Cobrador de Ônibus Cursino" ou "Cobrador de Ônibus Leste").
         - Escolha a unidade de Cobrador mais próxima da localização do candidato (Zona Leste -> Cobrador Leste; Cursino/Saúde/Ipiranga/ABC/Sul -> Cobrador Cursino).
         - Confiança deve ser "alta".

      2. OBJETIVO / CARGO PRETENDIDO ESPECÍFICO QUE NÃO TEM VAGA ABERTA:
         - Se o candidato quer um cargo específico (ex: "Coordenador de Tráfego", "Enfermeiro", "Advogado", "Analista Financeiro", "Vendedor", etc.) e NENHUMA vaga aberta corresponde a esse cargo:
         - NUNCA o atribua à vaga de Cobrador nem a nenhuma outra vaga diferente.
         - Retorne vaga_id como null, confianca como "nenhuma" e justificativa clara explicando que não há vaga disponível para o cargo pretendido pelo candidato.

      3. HISTÓRICO PROFISSIONAL E CRITÉRIOS DA VAGA (quando objetivo não for declarado):
         Se o objetivo não estiver explícito no currículo:
         - Compare as experiências anteriores e qualificações com os critérios textuais de cada vaga (exigências de CNH D/E para Motorista, cursos, escolaridade, etc.).
         - Avalie também a compatibilidade de endereço/localização com as unidades das vagas.

      4. NENHUMA VAGA COMPATÍVEL:
         Se nenhuma vaga fizer sentido para a profissão/perfil do candidato, retorne vaga_id como null e confianca como "nenhuma".      
      Retorne ESTRITAMENTE um JSON com a seguinte estrutura:
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

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'
import { corsHeaders } from '../_shared/cors.ts'

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

    // Busca todas as vagas ATIVAS disponíveis no sistema
    const { data: vagas, error: vagasError } = await supabase
      .from('vagas')
      .select('id, titulo, descricao, criterios_qualificacao')
      .eq('ativa', true)
      .order('criado_em', { ascending: false })

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

    // Função de normalização para matching textual robusto (remove acentos, pontuação e espaços extras)
    const normalizeString = (str: string): string => {
      return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    }

    // Extrair o objetivo explícito (se existir nos dados estruturados)
    const candidatoObjetivo =
      parsedDadosExtraidos?.objetivo ||
      parsedDadosExtraidos?.cargo_pretendido ||
      parsedDadosExtraidos?.cargo ||
      parsedDadosExtraidos?.objetivo_profissional ||
      ''

    // 1. Verificação direta em código: Se o objetivo do candidato tiver match forte com o TÍTULO da vaga
    if (candidatoObjetivo && typeof candidatoObjetivo === 'string') {
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
      ])

      const objWords = normObjetivo
        .split(' ')
        .map((w) => w.trim())
        .filter((w) => w.length >= 3 && !stopWords.has(w))

      if (objWords.length > 0) {
        // Avaliar correspondência com o título de cada vaga
        let bestMatchVaga: any = null
        let maxMatchedWords = 0

        for (const vaga of vagas) {
          const normTitulo = normalizeString(vaga.titulo || '')
          const tituloWords = new Set(
            normTitulo
              .split(' ')
              .map((w) => w.trim())
              .filter((w) => w.length >= 3 && !stopWords.has(w)),
          )

          // 1a. Match de frase exata (ex: "cobrador de onibus" dentro de "cobrador de onibus leste")
          if (normTitulo.includes(normObjetivo) || normObjetivo.includes(normTitulo)) {
            bestMatchVaga = vaga
            maxMatchedWords = 999
            break
          }

          // 1b. Contagem de palavras-chave coincidentes (ex: "cobrador" no objetivo e "cobrador" no título)
          let matchCount = 0
          for (const word of objWords) {
            if (tituloWords.has(word) || normTitulo.includes(word)) {
              matchCount++
            }
          }

          // Se bateu todas as palavras significativas do objetivo (ou a principal palavra)
          if (matchCount > 0 && matchCount > maxMatchedWords) {
            maxMatchedWords = matchCount
            bestMatchVaga = vaga
          }
        }

        // Se encontrou vaga com correspondência forte com o objetivo informado
        if (bestMatchVaga && maxMatchedWords > 0) {
          console.log(
            `[identify-vaga-from-cv] Match direto por objetivo "${candidatoObjetivo}" com vaga "${bestMatchVaga.titulo}" (ID: ${bestMatchVaga.id})`,
          )
          return new Response(
            JSON.stringify({
              vaga_id: bestMatchVaga.id,
              confianca: 'alta',
              justificativa: `Vaga identificada com alta prioridade devido à correspondência direta entre o objetivo do candidato ("${candidatoObjetivo}") e o título da vaga ("${bestMatchVaga.titulo}").`,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          )
        }
      }
    }

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
                'Você é um especialista em Recrutamento e Seleção de RH focado em análise técnica de currículos e Job Matching. Selecione a vaga solicitada ou a vaga mais compatível cadastrada com base estrita no objetivo e experiências do candidato.',
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

    const prompt = `
      Temos o seguinte currículo / dados do candidato:
      ${typeof cvDataToAnalyze === 'string' ? cvDataToAnalyze : JSON.stringify(cvDataToAnalyze)}

      E temos as seguintes vagas abertas (com seus IDs):
      ${JSON.stringify(vagas)}

      Sua tarefa é analisar o currículo e identificar a vaga pretendida/solicitada OU em qual dessas vagas o candidato melhor se encaixa.
      
      REGRAS CRÍTICAS DE MATCHING (SIGA RIGOROSAMENTE NA ORDEM):
      1. PRIORIDADE MÁXIMA - OBJETIVO / CARGO PRETENDIDO:
         Se o candidato tiver um "objetivo", "cargo pretendido" ou menção no texto a uma função específica (ex: "cobrador", "cobrador de ônibus", "motorista", "mecânico", "porteiro", "jovem aprendiz", "auxiliar administrativo", etc.):
         - Se existir qualquer vaga cujo TÍTULO corresponda a essa função (ex: objetivo "cobrador de ônibus" e vaga "Cobrador de Ônibus Leste"), ATRIBUA ESSA VAGA OBRIGATORIAMENTE com confiança "alta".
         - NUNCA atribua vagas genéricas como "Jovem Aprendiz" ou "Banco de Talentos" para candidatos cujo objetivo ou experiência indiquem uma função específica (ex: Cobrador, Motorista), mesmo que o candidato seja jovem ou não tenha vasta experiência.
      
      2. EXPERIÊNCIA E HISTÓRICO PROFISSIONAL:
         Se o objetivo não estiver explícito, analise os cargos das experiências anteriores. Se a maioria das experiências foi como "Cobrador", dê preferência à vaga de "Cobrador", e assim por diante.

      3. COMPATIBILIDADE GERAL:
         Somente use o critério genérico de "vaga mais compatível" quando NÃO existir vaga cujo título corresponda ao objetivo ou histórico de funções do candidato.

      4. NENHUMA VAGA:
         Se nenhuma vaga fizer sentido para a profissão/perfil do candidato, retorne vaga_id como null e confianca como "nenhuma".
      
      Retorne ESTRITAMENTE um JSON com a seguinte estrutura:
      {
        "vaga_id": "UUID da vaga correspondente ou null",
        "confianca": "alta", "media", "baixa" ou "nenhuma",
        "justificativa": "Explicação concisa do porquê escolheu essa vaga com base no objetivo ou experiências."
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

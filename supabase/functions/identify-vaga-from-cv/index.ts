import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
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

    const { candidato_id, user_id } = body

    if (!candidato_id) {
      return new Response(JSON.stringify({ error: 'Faltando candidato_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: candidato, error: candidatoError } = await supabase
      .from('candidatos')
      .select('dados_extraidos')
      .eq('id', candidato_id)
      .single()

    if (candidatoError || !candidato) {
      throw new Error('Candidato não encontrado no banco de dados.')
    }

    // Busca todas as vagas disponíveis no sistema (sem restrição por user_id)
    const vagasQuery = supabase
      .from('vagas')
      .select('id, titulo, descricao, criterios_qualificacao')
      .order('criado_em', { ascending: false })

    let { data: vagas, error: vagasError } = await vagasQuery

    // Se por algum motivo não houver vagas ou houver filtro opcional, fallback seguro
    if (!vagas || vagas.length === 0) {
      const { data: allVagas } = await supabase
        .from('vagas')
        .select('id, titulo, descricao, criterios_qualificacao')
      vagas = allVagas || []
    }

    if (vagasError) {
      throw new Error('Erro ao buscar as vagas do sistema.')
    }

    if (!vagas || vagas.length === 0) {
      return new Response(
        JSON.stringify({
          vaga_id: null,
          confianca: 'nenhuma',
          justificativa: 'Nenhuma vaga cadastrada e aberta foi encontrada no sistema.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
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
                'Você é um especialista em Recrutamento e Seleção focado em análise técnica de currículos e Job Matching.',
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
      Temos o seguinte currículo estruturado do candidato:
      ${JSON.stringify(candidato.dados_extraidos)}

      E temos as seguintes vagas abertas (com seus IDs):
      ${JSON.stringify(vagas)}

      Sua tarefa é analisar o currículo de forma aprofundada e identificar se o candidato tem aderência a alguma dessas vagas.
      
      Regras:
      1. Se uma vaga for altamente ou razoavelmente compatível, preencha o "vaga_id" e defina a confiança.
      2. Se nenhuma vaga for compatível com as experiências e qualificações, retorne vaga_id como null e confianca como "nenhuma" ou "baixa".
      
      Retorne ESTRITAMENTE um JSON com a seguinte estrutura:
      {
        "vaga_id": "UUID da vaga mais compatível ou null se nenhuma for adequada",
        "confianca": "alta", "media", "baixa" ou "nenhuma",
        "justificativa": "Explicação detalhada do porquê escolheu essa vaga ou porquê reprovou em todas."
      }
    `

    const result = await callOpenAIWithRetry(prompt)

    // Normalizing low confidences
    if (result.confianca === 'baixa' || result.confianca === 'nenhuma') {
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

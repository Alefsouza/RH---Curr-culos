import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import OpenAI from 'npm:openai@4'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Autorização ausente.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Usuário não autenticado.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const bodyText = await req.text()
    let body
    try {
      body = JSON.parse(bodyText)
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Payload inválido. Formato JSON esperado.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { cv_id, vaga_id } = body

    if (!cv_id || !vaga_id) {
      return new Response(
        JSON.stringify({ error: 'Os parâmetros cv_id e vaga_id são obrigatórios.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '')

    const { data: candidato, error: candidatoError } = await supabaseAdmin
      .from('candidatos')
      .select('*')
      .eq('id', cv_id)
      .eq('user_id', user.id)
      .single()

    if (candidatoError || !candidato) {
      return new Response(JSON.stringify({ error: 'Currículo não encontrado ou acesso negado.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: vaga, error: vagaError } = await supabaseAdmin
      .from('vagas')
      .select('*')
      .eq('id', vaga_id)
      .eq('user_id', user.id)
      .single()

    if (vagaError || !vaga) {
      return new Response(JSON.stringify({ error: 'Vaga não encontrada ou acesso negado.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const extracted =
      typeof candidato.dados_extraidos === 'object' && candidato.dados_extraidos !== null
        ? candidato.dados_extraidos
        : {}

    const cvData = {
      nome: candidato.nome,
      email: candidato.email,
      telefone: candidato.telefone,
      ...extracted,
    }

    const criterios = vaga.criterios_qualificacao || 'Sem critérios definidos.'

    const promptText = `Analise este currículo comparado com estes critérios de qualificação. Retorne um JSON com: status (pre_aprovado ou reprovado), motivo (explicação breve em português).
Currículo: ${JSON.stringify(cvData)}
Critérios: ${JSON.stringify(criterios)}`

    const openaiKey =
      Deno.env.get('OPENIA_KEY') || Deno.env.get('OPENAI_API_KEY') || Deno.env.get('OPENAI_KEY')
    if (!openaiKey) {
      console.log('ERRO: OPENIA_KEY não configurada')
      return new Response(JSON.stringify({ error: 'Chave OpenAI não configurada' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const openai = new OpenAI({ apiKey: openaiKey })

    const callOpenAIWithRetry = async (
      prompt: string,
      retries = 3,
      delays = [2000, 4000, 8000],
    ): Promise<any> => {
      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4-turbo',
          temperature: 1.0,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
        })
        const content = response.choices[0]?.message?.content
        return content ? JSON.parse(content) : {}
      } catch (error: any) {
        if (error.status === 503 && retries > 0) {
          const delay = delays[3 - retries] || 8000
          console.log(
            `Erro 503: Serviço indisponível. Tentando novamente em ${delay}ms... (${retries} tentativas)`,
          )
          await new Promise((res) => setTimeout(res, delay))
          return callOpenAIWithRetry(prompt, retries - 1, delays)
        }
        throw error
      }
    }

    let resultJson
    try {
      resultJson = await callOpenAIWithRetry(promptText)
    } catch (e: any) {
      console.error('Erro na chamada da API:', e)
      return new Response(
        JSON.stringify({
          error:
            'Serviço de análise temporariamente indisponível. Tente novamente em alguns instantes.',
        }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const status =
      resultJson.status === 'pre_aprovado' || resultJson.status === 'reprovado'
        ? resultJson.status
        : 'reprovado'
    const motivo = resultJson.motivo || 'Análise concluída sem detalhes adicionais.'

    const { data: existing } = await supabaseAdmin
      .from('analise_cv')
      .select('id')
      .eq('cv_id', cv_id)
      .eq('vaga_id', vaga_id)
      .maybeSingle()

    let analiseData
    if (existing) {
      const { data, error: updateError } = await supabaseAdmin
        .from('analise_cv')
        .update({ status, motivo, atualizado_em: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single()
      if (updateError) throw updateError
      analiseData = data
    } else {
      const { data, error: insertError } = await supabaseAdmin
        .from('analise_cv')
        .insert({ cv_id, vaga_id, status, motivo })
        .select()
        .single()
      if (insertError) throw insertError
      analiseData = data
    }

    return new Response(JSON.stringify({ data: { success: true, analise: analiseData } }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Erro interno:', error)
    return new Response(
      JSON.stringify({ error: 'Ocorreu um erro interno no servidor.', detalhes: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})

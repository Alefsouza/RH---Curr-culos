import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'
import { Buffer } from 'node:buffer'
import pdf from 'npm:pdf-parse@1.1.1'
import jwt from 'npm:jsonwebtoken'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('1. Iniciando analyze-resume')

    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')

    let userId = null
    if (token) {
      try {
        const decoded = jwt.decode(token) as any
        userId = decoded?.sub
      } catch (e) {
        console.log('Erro ao decodificar token:', e)
      }
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    if (!userId || typeof userId !== 'string' || userId.length !== 36 || !uuidRegex.test(userId)) {
      console.log('Erro: Usuário não autenticado ou userId inválido no JWT:', userId)
      return new Response(JSON.stringify({ error: 'Usuário não autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('User ID extraído do JWT:', userId)

    const bodyText = await req.text()
    let body
    try {
      body = JSON.parse(bodyText)
    } catch (e: any) {
      console.log('Erro na etapa 1:', e.message)
      return new Response(JSON.stringify({ error: 'Payload inválido. Formato JSON esperado.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { filePath, nome, email, telefone, vaga_id } = body

    console.log('2. Vaga ID recebido:', vaga_id)
    console.log('3. Arquivo recebido:', filePath)

    if (!filePath) {
      return new Response(JSON.stringify({ error: 'Arquivo PDF é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!vaga_id) {
      return new Response(JSON.stringify({ error: 'Vaga é obrigatória' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (typeof vaga_id !== 'string' || vaga_id.length !== 36 || !uuidRegex.test(vaga_id)) {
      return new Response(JSON.stringify({ error: 'Vaga inválida. Selecione uma vaga válida.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!nome) {
      return new Response(JSON.stringify({ error: 'Dados incompletos. Nome é obrigatório.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    const openaiKey = Deno.env.get('OPENAI_KEY') || Deno.env.get('OPENIA_KEY')
    if (!openaiKey) {
      const msg = 'Chave da API da OpenAI não configurada nos Secrets do Supabase.'
      console.log('Erro na etapa 1:', msg)
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: fileData, error: downloadError } = await supabase.storage
      .from('curriculos')
      .download(filePath)

    if (downloadError || !fileData) {
      console.log('Erro na etapa 3:', downloadError?.message || 'Erro ao baixar arquivo do Storage')
      return new Response(
        JSON.stringify({ error: 'Erro ao acessar o arquivo enviado no banco de dados.' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const arrayBuffer = await fileData.arrayBuffer()
    const pdfBuffer = Buffer.from(arrayBuffer)
    let pdfText = ''
    try {
      const data = await pdf(pdfBuffer)
      pdfText = data.text
    } catch (err: any) {
      console.log('Erro na etapa 3:', err.message)
      return new Response(JSON.stringify({ error: 'Erro ao extrair texto do PDF.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!pdfText || !pdfText.trim()) {
      return new Response(
        JSON.stringify({ error: 'O arquivo PDF está vazio ou não contém texto legível.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const openai = new OpenAI({ apiKey: openaiKey })

    const callOpenAIWithRetry = async (
      prompt: string,
      retries = 3,
      backoff = 2000,
    ): Promise<any> => {
      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'Você é um assistente de RH focado em estruturar dados de currículos. Retorne sempre um JSON válido.',
            },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
        })
        return JSON.parse(response.choices[0].message.content || '{}')
      } catch (error: any) {
        if (retries > 0) {
          await new Promise((resolve) => setTimeout(resolve, backoff))
          return callOpenAIWithRetry(prompt, retries - 1, backoff * 2)
        }
        throw error
      }
    }

    const extractionPrompt = `Extraia os seguintes dados do currículo: nome, email, telefone, experiencia profissional, skills, formacao academica.
Se algum dado não for encontrado, retorne null ou um array vazio.
Retorne ESTRITAMENTE em formato JSON com as seguintes chaves:
{
  "nome": "string ou null",
  "email": "string ou null",
  "telefone": "string ou null",
  "experiencia_profissional": ["string"],
  "skills": ["string"],
  "formacao_academica": ["string"]
}

Texto extraído do currículo:
${pdfText.substring(0, 15000)}`

    console.log('4. Chamando OpenAI')
    let extractedData
    try {
      extractedData = await callOpenAIWithRetry(extractionPrompt)
    } catch (err: any) {
      console.log('Erro na etapa 4:', err.message)
      return new Response(
        JSON.stringify({ error: 'Serviço de Inteligência Artificial indisponível no momento.' }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const finalEmail = email || extractedData.email || null
    const finalTelefone = telefone || extractedData.telefone || null
    const finalNome = nome || extractedData.nome || 'Candidato Desconhecido'

    console.log('5. Salvando candidato no banco')
    let candidatoId
    let analisesRealizadas = []

    try {
      const orConditions = []
      if (finalEmail) {
        const safeEmail = finalEmail.replace(/"/g, '')
        orConditions.push(`email.eq."${safeEmail}"`)
      }
      if (finalTelefone) {
        const safeTel = finalTelefone.replace(/"/g, '')
        orConditions.push(`telefone.eq."${safeTel}"`)
      }

      if (orConditions.length > 0) {
        const { data: duplicates, error: dupError } = await supabase
          .from('candidatos')
          .select('id')
          .eq('user_id', userId)
          .or(orConditions.join(','))

        if (dupError) throw dupError

        if (duplicates && duplicates.length > 0) {
          const idsToDelete = duplicates.map((d) => d.id)
          const { error: deleteError } = await supabase
            .from('candidatos')
            .delete()
            .in('id', idsToDelete)
          if (deleteError) throw deleteError
        }
      }

      const { data: publicUrlData } = supabase.storage.from('curriculos').getPublicUrl(filePath)

      const { data: newCandidate, error: insertCandidateError } = await supabase
        .from('candidatos')
        .insert({
          nome: finalNome,
          email: finalEmail,
          telefone: finalTelefone,
          fonte: 'site',
          curriculo_url: publicUrlData.publicUrl,
          vaga_id: vaga_id,
          user_id: userId,
        })
        .select('id')
        .single()

      if (insertCandidateError) throw insertCandidateError
      candidatoId = newCandidate.id

      let { data: etapa, error: etapaError } = await supabase
        .from('etapas')
        .select('id')
        .eq('user_id', userId)
        .ilike('nome', 'Nunca Responderam')
        .maybeSingle()

      if (etapaError) throw etapaError

      if (!etapa) {
        const { data: newEtapa, error: insertEtapaError } = await supabase
          .from('etapas')
          .insert({
            nome: 'Nunca Responderam',
            ordem: 0,
            cor: 'bg-slate-200',
            user_id: userId,
          })
          .select('id')
          .single()

        if (insertEtapaError) throw insertEtapaError
        etapa = newEtapa
      }

      if (etapa) {
        const { error: relError } = await supabase.from('candidato_etapa').insert({
          candidato_id: candidatoId,
          etapa_id: etapa.id,
          usuario_id: userId,
        })
        if (relError) throw relError

        const { error: updError } = await supabase
          .from('candidatos')
          .update({ etapa_id: etapa.id })
          .eq('id', candidatoId)
        if (updError) throw updError
      }
    } catch (dbError: any) {
      console.log('Erro na etapa 5:', dbError.message)
      return new Response(
        JSON.stringify({
          error: 'Ocorreu um erro interno ao salvar os dados no banco de dados.',
          detalhes: dbError.message || JSON.stringify(dbError),
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    console.log('6. Salvando análise no banco')
    try {
      if (vaga_id && candidatoId) {
        const { data: vaga, error: vagaError } = await supabase
          .from('vagas')
          .select('*')
          .eq('id', vaga_id)
          .single()

        if (vagaError) throw vagaError

        if (vaga) {
          const analyzePrompt = `Analise o currículo para a vaga de "${vaga.titulo}".
Descrição da vaga: ${vaga.descricao || 'Não informada'}
Critérios de Qualificação: ${JSON.stringify(vaga.criterios_qualificacao || {})}

Dados estruturados do currículo:
${JSON.stringify(extractedData)}

Retorne ESTRITAMENTE em formato JSON com as seguintes chaves:
{
  "resultado": "qualificado" | "nao_qualificado" | "revisar",
  "detalhes": {
    "pontos_fortes": ["string"],
    "pontos_fracos": ["string"],
    "aderencia": "percentual de aderência (ex: 80%)"
  }
}`

          const analiseJson = await callOpenAIWithRetry(analyzePrompt)

          const { data: novaAnalise, error: analiseError } = await supabase
            .from('analises')
            .insert({
              candidato_id: candidatoId,
              vaga_id: vaga.id,
              resultado: analiseJson.resultado || 'revisar',
              detalhes: analiseJson.detalhes || {},
              user_id: userId,
            })
            .select()
            .single()

          if (!analiseError) {
            analisesRealizadas.push(novaAnalise)
          } else {
            throw analiseError
          }
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          candidato_id: candidatoId,
          dados_extraidos: extractedData,
          analises: analisesRealizadas,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    } catch (dbError: any) {
      console.log('Erro na etapa 6:', dbError.message)
      return new Response(
        JSON.stringify({
          error: 'Ocorreu um erro interno ao salvar a análise no banco de dados.',
          detalhes: dbError.message || JSON.stringify(dbError),
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }
  } catch (error: any) {
    console.log('Erro geral:', error.message)
    return new Response(
      JSON.stringify({
        error: 'Ocorreu um erro interno inesperado no servidor ao processar o currículo.',
        detalhes: error.message || String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})

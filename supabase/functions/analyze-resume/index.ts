import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { GoogleGenerativeAI } from 'npm:@google/generative-ai'
import { Buffer } from 'node:buffer'
import pdf from 'npm:pdf-parse@1.1.1'

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
        const parts = token.split('.')
        if (parts.length >= 2) {
          const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
          const payload = JSON.parse(atob(base64))
          userId = payload.sub
        }
      } catch (e) {
        console.log('Erro ao decodificar token:', e)
      }
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    if (!userId || typeof userId !== 'string' || userId.length !== 36 || !uuidRegex.test(userId)) {
      console.log('Erro: Usuário não autenticado ou userId inválido no JWT:', userId)
      return new Response(
        JSON.stringify({ error: 'Usuário não autenticado. Faça login novamente.' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
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

    const googleApiKey = Deno.env.get('GOOGLE_API_KEY')
    if (!googleApiKey) {
      const msg = 'Chave da API do Google (GOOGLE_API_KEY) não configurada nos Secrets do Supabase.'
      console.log('Erro na etapa 1:', msg)
      return new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    let fileData
    try {
      const { data, error: downloadError } = await supabase.storage
        .from('curriculos')
        .download(filePath)

      if (downloadError || !data) {
        throw new Error(downloadError?.message || 'Erro ao baixar arquivo do Storage')
      }
      fileData = data
    } catch (err: any) {
      console.log('Erro na etapa 3:', err.message)
      return new Response(
        JSON.stringify({ error: 'Erro ao acessar o arquivo enviado no banco de dados.' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    console.log('4. Iniciando extração de texto do PDF')
    let pdfText = ''
    let arrayBuffer: ArrayBuffer
    try {
      arrayBuffer = await fileData.arrayBuffer()
      const pdfBuffer = Buffer.from(arrayBuffer)
      const data = await pdf(pdfBuffer)
      pdfText = data.text
    } catch (err: any) {
      console.log('Erro na etapa 4:', err.message)
      return new Response(JSON.stringify({ error: 'Erro ao extrair texto do PDF.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const genAI = new GoogleGenerativeAI(googleApiKey)
    const callGeminiWithRetry = async (
      prompt: string | any[],
      retries = 3,
      backoff = 2000,
    ): Promise<any> => {
      try {
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
        const result = await model.generateContent(prompt)
        let text = await result.response.text()
        text = text
          .replace(/```json/gi, '')
          .replace(/```/g, '')
          .trim()
        return JSON.parse(text || '{}')
      } catch (error: any) {
        if (retries > 0) {
          await new Promise((resolve) => setTimeout(resolve, backoff))
          return callGeminiWithRetry(prompt, retries - 1, backoff * 2)
        }
        throw error
      }
    }

    console.log('5. Chamando Gemini para análise')
    let extractedData
    try {
      if (!pdfText || pdfText.trim().length < 50) {
        console.log('OCR com Gemini Vision ativado')
        const base64pdf = Buffer.from(arrayBuffer!).toString('base64')
        const ocrPrompt = `Extraia todo o texto deste currículo em português. Retorne em JSON estruturado com os seguintes campos: nome (string), email (string), telefone (string), experiencia_profissional (array de strings), skills (array de strings), formacao_academica (array de strings). Retorne APENAS o JSON, sem marcações markdown.`

        extractedData = await callGeminiWithRetry([
          {
            inlineData: {
              data: base64pdf,
              mimeType: 'application/pdf',
            },
          },
          { text: ocrPrompt },
        ])
      } else {
        const analyzePrompt = `Extraia deste currículo em português os seguintes campos em JSON estruturado: nome (string), email (string), telefone (string), experiencia_profissional (array de strings), skills (array de strings), formacao_academica (array de strings). Retorne APENAS o JSON, sem marcações markdown.\n\nCurrículo:\n${pdfText.substring(0, 15000)}`
        extractedData = await callGeminiWithRetry(analyzePrompt)
      }

      if (!extractedData.nome || typeof extractedData !== 'object') {
        throw new Error('Falha ao extrair dados ou JSON inválido')
      }
    } catch (err: any) {
      console.log('Erro na etapa 5:', err.message)
      return new Response(
        JSON.stringify({
          error:
            'Serviço de Inteligência Artificial indisponível ou falhou ao analisar o documento.',
        }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const finalEmail = email || extractedData.email || null
    const finalTelefone = telefone || extractedData.telefone || null
    const finalNome = nome || extractedData.nome || 'Candidato Desconhecido'

    console.log('6. Salvando candidato no banco')
    let candidatoId
    let analisesRealizadas: any[] = []

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
      console.log('Erro na etapa 6:', dbError.message)
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

    console.log('7. Salvando análise no banco')
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

Retorne ESTRITAMENTE em formato JSON com as seguintes chaves (sem marcações markdown):
{
  "resultado": "qualificado" | "nao_qualificado" | "revisar",
  "detalhes": {
    "pontos_fortes": ["string"],
    "pontos_fracos": ["string"],
    "aderencia": "percentual de aderência (ex: 80%)"
  }
}`

          const analiseJson = await callGeminiWithRetry(analyzePrompt)

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

      console.log('8. Retornando sucesso')
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
      console.log('Erro na etapa 7:', dbError.message)
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

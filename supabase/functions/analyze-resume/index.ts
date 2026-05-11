import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'
import { Buffer } from 'node:buffer'
import pdf from 'npm:pdf-parse@1.1.1'
import pdf2img from 'npm:pdf-img-convert@1.2.1'

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
    console.log('Iniciando analyze-resume com OpenAI')

    const openaiKey =
      Deno.env.get('OPENIA_KEY') || Deno.env.get('OPENAI_API_KEY') || Deno.env.get('OPENAI_KEY')
    if (!openaiKey) {
      console.log('ERRO: OPENIA_KEY não configurada nas Secrets')
      return new Response(JSON.stringify({ error: 'Chave OpenAI não configurada' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    console.log('OPENIA_KEY encontrada')

    const openai = new OpenAI({ apiKey: openaiKey })
    console.log('OpenAI inicializado com sucesso')

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

    const bodyText = await req.text()
    let body
    try {
      body = JSON.parse(bodyText)
    } catch (e: any) {
      return new Response(JSON.stringify({ error: 'Payload inválido. Formato JSON esperado.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { filePath, nome, email, telefone, vaga_id } = body

    if (!filePath) {
      return new Response(JSON.stringify({ error: 'Arquivo PDF é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!vaga_id || typeof vaga_id !== 'string' || !uuidRegex.test(vaga_id)) {
      return new Response(JSON.stringify({ error: 'Vaga inválida. Selecione uma vaga válida.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    let fileData
    try {
      const { data, error: downloadError } = await supabase.storage
        .from('curriculos')
        .download(filePath)
      if (downloadError || !data) throw new Error('Erro ao baixar do Storage')
      fileData = data
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Erro ao acessar o arquivo enviado no banco de dados.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    let pdfText = ''
    let arrayBuffer: ArrayBuffer
    let extractedData

    try {
      arrayBuffer = await fileData.arrayBuffer()
      const pdfBuffer = Buffer.from(arrayBuffer)
      const data = await pdf(pdfBuffer)
      pdfText = data.text
    } catch (err) {
      console.log('Erro ao extrair texto do PDF com pdfjs:', err)
    }

    if (!pdfText || pdfText.trim().length < 50) {
      console.log('OCR com OpenAI Vision ativado')
      try {
        const pdfArray = new Uint8Array(arrayBuffer!)
        const images = await pdf2img.convert(pdfArray, { page_numbers: [1] })

        if (images && images.length > 0) {
          const base64Image = Buffer.from(images[0]).toString('base64')
          const dataUrl = `data:image/png;base64,${base64Image}`

          const visionResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Extraia todo o texto deste currículo em português. Retorne em JSON estruturado com os seguintes campos: nome (string), email (string), telefone (string), experiencia_profissional (array de strings), skills (array de strings), formacao_academica (array de strings). Retorne APENAS o JSON, sem explicações.',
                  },
                  { type: 'image_url', image_url: { url: dataUrl } },
                ],
              },
            ],
            response_format: { type: 'json_object' },
            max_tokens: 2000,
          })

          const responseText = visionResponse.choices[0]?.message?.content || ''
          if (!responseText) throw new Error('Vazio')
          extractedData = JSON.parse(responseText)
          pdfText = JSON.stringify(extractedData)
        }
      } catch (err) {
        console.error('Erro na OpenAI Vision:', err)
        return new Response(
          JSON.stringify({
            error:
              'Serviço de análise temporariamente indisponível. Tente novamente em alguns instantes.',
          }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    if (!pdfText || pdfText.trim().length < 50) {
      return new Response(
        JSON.stringify({
          error:
            'Não consegui extrair texto do PDF. Certifique-se de que é um PDF válido com texto legível.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!extractedData) {
      const analyzePrompt = `Extraia deste currículo em português os seguintes campos em JSON estruturado: nome (string), email (string), telefone (string), experiencia_profissional (array de strings), skills (array de strings), formacao_academica (array de strings). Retorne APENAS o JSON, sem explicações.\n\nCurrículo:\n${pdfText.substring(0, 15000)}`

      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: analyzePrompt }],
          response_format: { type: 'json_object' },
          max_tokens: 2000,
        })
        const responseText = response.choices[0]?.message?.content || ''
        if (!responseText) throw new Error('Vazio')
        extractedData = JSON.parse(responseText)
      } catch (err) {
        console.error('Erro na OpenAI Text:', err)
        return new Response(
          JSON.stringify({
            error:
              'Serviço de análise temporariamente indisponível. Tente novamente em alguns instantes.',
          }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    const finalEmail = email || extractedData?.email || null
    const finalTelefone = telefone || extractedData?.telefone || null
    const finalNome = nome || extractedData?.nome || 'Candidato Desconhecido'

    let candidatoId
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
      const { data: duplicates } = await supabase
        .from('candidatos')
        .select('id')
        .eq('user_id', userId)
        .or(orConditions.join(','))
      if (duplicates && duplicates.length > 0) {
        await supabase
          .from('candidatos')
          .delete()
          .in(
            'id',
            duplicates.map((d) => d.id),
          )
      }
    }

    const { data: publicUrlData } = supabase.storage.from('curriculos').getPublicUrl(filePath)

    const { data: newCandidate, error: insertError } = await supabase
      .from('candidatos')
      .insert({
        nome: finalNome,
        email: finalEmail,
        telefone: finalTelefone,
        fonte: 'site',
        curriculo_url: publicUrlData.publicUrl,
        vaga_id: vaga_id,
        user_id: userId,
        dados_extraidos: extractedData,
      })
      .select('id')
      .single()

    if (insertError) throw insertError
    candidatoId = newCandidate.id

    let { data: etapa } = await supabase
      .from('etapas')
      .select('id')
      .eq('user_id', userId)
      .ilike('nome', 'Nunca Responderam')
      .maybeSingle()

    if (!etapa) {
      const { data: newEtapa } = await supabase
        .from('etapas')
        .insert({ nome: 'Nunca Responderam', ordem: 0, cor: 'bg-slate-200', user_id: userId })
        .select('id')
        .single()
      etapa = newEtapa
    }

    if (etapa) {
      await supabase
        .from('candidato_etapa')
        .insert({ candidato_id: candidatoId, etapa_id: etapa.id, usuario_id: userId })
      await supabase.from('candidatos').update({ etapa_id: etapa.id }).eq('id', candidatoId)
    }

    const analisesRealizadas = []
    const { data: vaga } = await supabase.from('vagas').select('*').eq('id', vaga_id).single()
    if (vaga) {
      const prompt = `Analise o currículo para a vaga de "${vaga.titulo}".
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
      let analiseJson: any = { resultado: 'revisar', detalhes: {} }
      try {
        const res = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          max_tokens: 1500,
        })
        const text = res.choices[0]?.message?.content
        if (text) analiseJson = JSON.parse(text)
      } catch (e) {}

      const { data: novaAnalise } = await supabase
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

      if (novaAnalise) analisesRealizadas.push(novaAnalise)
    }

    return new Response(
      JSON.stringify({
        success: true,
        candidato_id: candidatoId,
        dados_extraidos: extractedData,
        analises: analisesRealizadas,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: 'Ocorreu um erro interno inesperado no servidor ao processar o currículo.',
        detalhes: error.message,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

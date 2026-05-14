import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import OpenAI from 'npm:openai@4'
import { Buffer } from 'node:buffer'
import pdf from 'npm:pdf-parse@1.1.1'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const bodyText = await req.text()
    let body: any = {}
    if (bodyText) {
      try {
        body = JSON.parse(bodyText)
      } catch (e) {
        console.error('Erro ao fazer parse do JSON do webhook:', e)
      }
    }

    const userId = url.searchParams.get('user_id') || body.user_id
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Faltando user_id na requisição.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let attachmentBase64 = ''
    let attachmentName = ''

    const attachments = body.attachments || (body.value && body.value[0]?.attachments) || []
    for (const att of attachments) {
      if (att.name?.toLowerCase().endsWith('.pdf') || att.contentType === 'application/pdf') {
        attachmentBase64 = att.contentBytes || att.content || ''
        attachmentName = att.name
        break
      }
    }

    if (!attachmentBase64) {
      return new Response(JSON.stringify({ error: 'Nenhum arquivo PDF encontrado no e-mail.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2 & 3. Parse PDF
    const pdfBuffer = Buffer.from(attachmentBase64, 'base64')
    let pdfText = ''
    try {
      const data = await pdf(pdfBuffer)
      pdfText = data.text
    } catch (err) {
      console.error('Erro ao ler PDF:', err)
      return new Response(JSON.stringify({ error: 'Erro ao extrair texto do PDF.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!pdfText.trim()) {
      return new Response(
        JSON.stringify({ error: 'O arquivo PDF está vazio ou não contém texto legível.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // 4. OpenAI Extraction
    const openaiKey = Deno.env.get('OPENAI_KEY') || Deno.env.get('OPENIA_KEY')
    if (!openaiKey) {
      throw new Error('Chave da API da OpenAI não configurada no servidor.')
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
        if (error.status === 503 && retries > 0) {
          console.log(`OpenAI 503, tentando novamente em ${backoff}ms...`)
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
${pdfText.substring(0, 15000)}
`

    let extractedData
    try {
      extractedData = await callOpenAIWithRetry(extractionPrompt)
    } catch (err) {
      console.error('Erro na chamada da OpenAI:', err)
      return new Response(
        JSON.stringify({
          error: 'Erro ao analisar os dados do currículo com Inteligência Artificial.',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // Validação
    if (!extractedData.nome) {
      return new Response(
        JSON.stringify({ error: 'Nome não encontrado no currículo (dado obrigatório).' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    if (extractedData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(extractedData.email)) {
      return new Response(JSON.stringify({ error: 'O e-mail extraído do currículo é inválido.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 5 & 6. Deduplicação
    const cleanEmail = extractedData.email ? extractedData.email.replace(/"/g, '') : null
    const cleanTelefone = extractedData.telefone ? extractedData.telefone.replace(/"/g, '') : null
    const cleanNome = extractedData.nome ? extractedData.nome.replace(/"/g, '') : null

    const orConditions = []
    if (cleanEmail) orConditions.push(`email.eq."${cleanEmail}"`)
    if (cleanTelefone) orConditions.push(`telefone.eq."${cleanTelefone}"`)
    if (cleanNome) orConditions.push(`nome.eq."${cleanNome}"`)

    if (orConditions.length > 0) {
      const { data: duplicates, error: searchError } = await supabase
        .from('candidatos')
        .select('id')
        .eq('user_id', userId)
        .or(orConditions.join(','))

      if (searchError) console.error('Erro ao buscar duplicados:', searchError)

      if (duplicates && duplicates.length > 0) {
        const idsToDelete = duplicates.map((d) => d.id)
        await supabase.from('candidatos').delete().in('id', idsToDelete)
      }
    }

    // 7. Inserir Candidato
    const { data: newCandidate, error: insertCandidateError } = await supabase
      .from('candidatos')
      .insert({
        nome: extractedData.nome,
        email: extractedData.email || null,
        telefone: extractedData.telefone || null,
        fonte: 'outlook',
        user_id: userId,
      })
      .select('id')
      .single()

    if (insertCandidateError) throw insertCandidateError
    const candidatoId = newCandidate.id

    // 8. Etapa "Nunca Responderam"
    let { data: etapa } = await supabase
      .from('etapas')
      .select('id')
      .eq('user_id', userId)
      .ilike('nome', 'Nunca Responderam')
      .maybeSingle()

    if (!etapa) {
      const { data: newEtapa } = await supabase
        .from('etapas')
        .insert({
          nome: 'Nunca Responderam',
          ordem: 0,
          cor: 'bg-gray-200',
          user_id: userId,
        })
        .select('id')
        .single()
      etapa = newEtapa
    }

    if (etapa) {
      await supabase.from('candidato_etapa').insert({
        candidato_id: candidatoId,
        etapa_id: etapa.id,
        usuario_id: userId,
      })
      await supabase.from('candidatos').update({ etapa_id: etapa.id }).eq('id', candidatoId)
    }

    // 9 & 10. Analisar contra vagas abertas
    const { data: vagas } = await supabase.from('vagas').select('*').eq('user_id', userId)
    const analisesRealizadas = []

    if (vagas && vagas.length > 0) {
      for (const vaga of vagas) {
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

        try {
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

          if (!analiseError) analisesRealizadas.push(novaAnalise)
          else console.error('Erro ao inserir análise no banco:', analiseError)
        } catch (e) {
          console.error(`Erro ao analisar a vaga ${vaga.titulo}:`, e)
        }
      }
    }

    // 11. Resposta de Sucesso
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
  } catch (error: any) {
    console.error('Erro interno ao processar webhook:', error)
    return new Response(
      JSON.stringify({
        error: 'Ocorreu um erro interno no servidor ao processar o currículo.',
        detalhes: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})

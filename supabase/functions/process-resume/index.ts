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

    const { filePath, nome, email, telefone, vaga_id, user_id } = body

    if (!filePath || !nome || !email || !user_id) {
      return new Response(JSON.stringify({ error: 'Dados incompletos fornecidos.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1. Download PDF from Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('curriculos')
      .download(filePath)

    if (downloadError || !fileData) {
      console.error('Erro ao baixar arquivo:', downloadError)
      return new Response(
        JSON.stringify({ error: 'Erro ao acessar o arquivo enviado no Storage.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // 2. Parse PDF
    const arrayBuffer = await fileData.arrayBuffer()
    const pdfBuffer = Buffer.from(arrayBuffer)
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

    // 3. OpenAI Extraction
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
          console.log(`OpenAI 503, retentando em ${backoff}ms...`)
          await new Promise((resolve) => setTimeout(resolve, backoff))
          return callOpenAIWithRetry(prompt, retries - 1, backoff * 2)
        }
        throw error
      }
    }

    const extractionPrompt = `Extraia os seguintes dados do currículo: nome, email, telefone, endereco, experiencia profissional, skills, formacao academica.
Se algum dado não for encontrado, retorne null ou um array vazio.
Retorne ESTRITAMENTE em formato JSON com as seguintes chaves:
{
  "nome": "string",
  "email": "string",
  "telefone": "string",
  "endereco": "string",
  "experiencia_profissional": ["string"],
  "skills": ["string"],
  "formacao_academica": ["string"]
}

Texto extraído do currículo:
${pdfText.substring(0, 15000)}`

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

    const finalEmail = email || extractedData.email || null
    const finalTelefone = telefone || extractedData.telefone || null
    const finalNome = nome || extractedData.nome || 'Candidato Desconhecido'

    // 4. Deduplication
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
        .eq('user_id', user_id)
        .or(orConditions.join(','))

      if (duplicates && duplicates.length > 0) {
        const idsToDelete = duplicates.map((d) => d.id)
        await supabase.from('candidatos').delete().in('id', idsToDelete)
      }
    }

    // 5. Stage "Novos"
    let { data: etapa } = await supabase
      .from('etapas')
      .select('id')
      .eq('user_id', user_id)
      .ilike('nome', 'Novos')
      .maybeSingle()

    if (!etapa) {
      const { data: newEtapa } = await supabase
        .from('etapas')
        .insert({
          nome: 'Novos',
          ordem: 0,
          cor: 'bg-blue-100',
          user_id: user_id,
        })
        .select('id')
        .single()
      etapa = newEtapa
    }

    // 6. Insert Candidate
    const { data: publicUrlData } = supabase.storage.from('curriculos').getPublicUrl(filePath)

    const { data: newCandidate, error: insertCandidateError } = await supabase
      .from('candidatos')
      .insert({
        nome: finalNome,
        email: finalEmail,
        telefone: finalTelefone,
        fonte: 'site',
        curriculo_url: publicUrlData.publicUrl,
        vaga_id: vaga_id || null,
        user_id: user_id,
        etapa_id: etapa?.id,
      })
      .select('id')
      .single()

    if (insertCandidateError) {
      console.error('Erro ao inserir candidato:', insertCandidateError)
      throw insertCandidateError
    }
    const candidatoId = newCandidate.id

    if (etapa) {
      await supabase.from('candidato_etapa').insert({
        candidato_id: candidatoId,
        etapa_id: etapa.id,
        usuario_id: user_id,
      })
    }

    // 7. Analyze against job criteria
    const analisesRealizadas = []
    if (vaga_id) {
      const { data: vaga } = await supabase.from('vagas').select('*').eq('id', vaga_id).single()

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

        try {
          const analiseJson = await callOpenAIWithRetry(analyzePrompt)
          const { data: novaAnalise, error: analiseError } = await supabase
            .from('analises')
            .insert({
              candidato_id: candidatoId,
              vaga_id: vaga.id,
              resultado: analiseJson.resultado || 'revisar',
              detalhes: analiseJson.detalhes || {},
              user_id: user_id,
            })
            .select()
            .single()

          if (!analiseError) {
            analisesRealizadas.push(novaAnalise)
          } else {
            console.error('Erro ao inserir análise:', analiseError)
          }
        } catch (e) {
          console.error(`Erro ao analisar a vaga ${vaga.titulo}:`, e)
        }
      }
    }

    // 8. Success Response
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
    console.error('Erro interno:', error)
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

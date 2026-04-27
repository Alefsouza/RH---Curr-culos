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

    console.log(`Baixando arquivo: ${filePath}`)

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

    console.log(`Arquivo baixado com sucesso, tamanho: ${fileData.size}`)

    // 2. Parse PDF
    const arrayBuffer = await fileData.arrayBuffer()
    const pdfBuffer = Buffer.from(arrayBuffer)
    let pdfText = ''
    try {
      console.log('Iniciando extração de texto do PDF...')
      const data = await pdf(pdfBuffer)
      pdfText = data.text
      console.log(`Texto extraído com sucesso, tamanho: ${pdfText.length}`)
    } catch (err) {
      console.error('Erro ao ler PDF:', err)
      return new Response(
        JSON.stringify({
          error:
            'Erro ao extrair texto do PDF. Certifique-se de que o arquivo é um PDF válido e legível.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    if (!pdfText || !pdfText.trim()) {
      return new Response(
        JSON.stringify({
          error:
            'O arquivo PDF está vazio ou não contém texto legível (pode ser uma imagem sem OCR).',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // 3. OpenAI Extraction
    const openaiKey = Deno.env.get('OPENAI_KEY') || Deno.env.get('OPENIA_KEY')
    if (!openaiKey) {
      console.error('Chave da API da OpenAI não configurada.')
      return new Response(
        JSON.stringify({ error: 'Configuração do servidor incompleta (OpenAI).' }),
        {
          status: 500,
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
        console.error('Erro na OpenAI:', error.message || error)
        if (error.status === 503 && retries > 0) {
          console.log(`OpenAI 503, retentando em ${backoff}ms...`)
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

    let extractedData
    try {
      console.log('Enviando texto para OpenAI...')
      extractedData = await callOpenAIWithRetry(extractionPrompt)
      console.log('Dados extraídos com sucesso')
    } catch (err: any) {
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

    console.log('Iniciando deduplicação...')
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
      const { data: duplicates, error: dupError } = await supabase
        .from('candidatos')
        .select('id')
        .eq('user_id', user_id)
        .or(orConditions.join(','))

      if (dupError) {
        console.error('Erro ao buscar duplicados:', dupError)
      }

      if (duplicates && duplicates.length > 0) {
        console.log(`Encontrados ${duplicates.length} candidatos duplicados. Removendo...`)
        const idsToDelete = duplicates.map((d) => d.id)
        await supabase.from('candidatos').delete().in('id', idsToDelete)
      }
    }

    // 5. Insert Candidate
    console.log('Inserindo candidato...')
    const { data: publicUrlData } = supabase.storage.from('curriculos').getPublicUrl(filePath)

    const finalVagaId = vaga_id && vaga_id !== 'none' && vaga_id !== '' ? vaga_id : null

    const { data: newCandidate, error: insertCandidateError } = await supabase
      .from('candidatos')
      .insert({
        nome: finalNome,
        email: finalEmail,
        telefone: finalTelefone,
        fonte: 'site',
        curriculo_url: publicUrlData.publicUrl,
        vaga_id: finalVagaId,
        user_id: user_id,
      })
      .select('id')
      .single()

    if (insertCandidateError) {
      console.error('Erro ao inserir candidato:', insertCandidateError)
      return new Response(JSON.stringify({ error: 'Erro ao salvar os dados do candidato.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const candidatoId = newCandidate.id

    // 6. Stage "Nunca Responderam"
    console.log('Buscando etapa "Nunca Responderam"...')
    let { data: etapa } = await supabase
      .from('etapas')
      .select('id')
      .eq('user_id', user_id)
      .ilike('nome', 'Nunca Responderam')
      .maybeSingle()

    if (!etapa) {
      console.log('Etapa não encontrada. Criando nova etapa...')
      const { data: newEtapa } = await supabase
        .from('etapas')
        .insert({
          nome: 'Nunca Responderam',
          ordem: 0,
          cor: 'bg-slate-200',
          user_id: user_id,
        })
        .select('id')
        .single()
      etapa = newEtapa
    }

    if (etapa) {
      await supabase.from('candidato_etapa').insert({
        candidato_id: candidatoId,
        etapa_id: etapa.id,
        usuario_id: user_id,
      })
      await supabase.from('candidatos').update({ etapa_id: etapa.id }).eq('id', candidatoId)
    }

    // 7. Analyze against job criteria
    const analisesRealizadas = []
    if (finalVagaId) {
      console.log(`Analisando contra critérios da vaga ${finalVagaId}...`)
      const { data: vaga } = await supabase.from('vagas').select('*').eq('id', finalVagaId).single()

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

    console.log('Processo concluído com sucesso!')

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

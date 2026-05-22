import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'
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

    if (!filePath || !user_id) {
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

    // 2. Parse Document
    const arrayBuffer = await fileData.arrayBuffer()
    const fileBuffer = Buffer.from(arrayBuffer)
    let extractedText = ''
    try {
      if (filePath.toLowerCase().endsWith('.docx')) {
        const mammoth = await import('npm:mammoth')
        const data = await mammoth.extractRawText({ buffer: fileBuffer })
        extractedText = data.value
      } else {
        const data = await pdf(fileBuffer)
        extractedText = data.text
      }
    } catch (err) {
      console.error('Erro ao ler arquivo:', err)
      return new Response(JSON.stringify({ error: 'Erro ao extrair texto do arquivo.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!extractedText.trim()) {
      return new Response(
        JSON.stringify({ error: 'O arquivo está vazio ou não contém texto legível.' }),
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

    const extractionPrompt = `Extraia os seguintes dados do currículo: nome, email, telefones celulares, experiencia profissional, skills, formacao academica, endereço (cidade e estado ou completo).
Extraia APENAS números de telefone celular brasileiros (DDD + 9 dígitos, começando com 9). Ignore telefones fixos. Formato: 11999999999.
Se algum dado não for encontrado, retorne null ou um array vazio.
Retorne ESTRITAMENTE em formato JSON com as seguintes chaves:
{
  "nome": "string",
  "email": "string",
  "telefones_celulares": ["string"],
  "endereco": "string ou null",
  "experiencia_profissional": ["string"],
  "skills": ["string"],
  "formacao_academica": ["string"]
}

Texto extraído do currículo:
${extractedText.substring(0, 15000)}`

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

    const finalEmail = extractedData.email || email || null

    let telefonesArr: string[] = []
    if (Array.isArray(extractedData.telefones_celulares)) {
      telefonesArr = extractedData.telefones_celulares
    } else if (extractedData.telefone) {
      telefonesArr = [extractedData.telefone]
    }

    const finalTelefone = telefonesArr.length > 0 ? telefonesArr.join(',') : telefone || null
    const finalNome = extractedData.nome || nome || 'Candidato Desconhecido'

    // 4. Deduplication
    const orConditions = []
    if (finalEmail) {
      const safeEmail = finalEmail.replace(/"/g, '')
      orConditions.push(`email.eq."${safeEmail}"`)
    }
    if (finalTelefone) {
      const tels = finalTelefone
        .split(',')
        .map((t: string) => t.trim())
        .filter(Boolean)
      for (const tel of tels) {
        const safeTel = tel.replace(/"/g, '')
        orConditions.push(`telefone.ilike."%${safeTel}%"`)
      }
    }

    const { data: publicUrlData } = supabase.storage.from('curriculos').getPublicUrl(filePath)

    let candidatoId

    if (orConditions.length > 0) {
      const { data: duplicates } = await supabase
        .from('candidatos')
        .select('id, vaga_id')
        .eq('user_id', user_id)
        .or(orConditions.join(','))

      if (duplicates && duplicates.length > 0) {
        candidatoId = duplicates[0].id

        await supabase
          .from('candidatos')
          .update({
            nome: finalNome,
            email: finalEmail,
            telefone: finalTelefone,
            curriculo_url: publicUrlData.publicUrl,
            dados_extraidos: extractedData,
            vaga_id: vaga_id || duplicates[0].vaga_id,
          })
          .eq('id', candidatoId)
      }
    }

    if (!candidatoId) {
      // 5. Insert Candidate
      const { data: newCandidate, error: insertCandidateError } = await supabase
        .from('candidatos')
        .insert({
          nome: finalNome,
          email: finalEmail,
          telefone: finalTelefone,
          fonte: 'site',
          curriculo_url: publicUrlData.publicUrl,
          dados_extraidos: extractedData,
          vaga_id: vaga_id || null,
          user_id: user_id,
        })
        .select('id')
        .single()

      if (insertCandidateError) {
        console.error('Erro ao inserir candidato:', insertCandidateError)
        throw insertCandidateError
      }
      candidatoId = newCandidate.id
    }

    // 6. Verificar Etapa Atual
    const { data: currentCandidate } = await supabase
      .from('candidatos')
      .select('etapa_id')
      .eq('id', candidatoId)
      .single()

    if (!currentCandidate?.etapa_id) {
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

      if (etapa) {
        await supabase.from('candidato_etapa').insert({
          candidato_id: candidatoId,
          etapa_id: etapa.id,
          usuario_id: user_id,
        })
        await supabase.from('candidatos').update({ etapa_id: etapa.id }).eq('id', candidatoId)
      }
    }

    // 7. Analyze against job criteria
    const analisesRealizadas = []
    if (vaga_id) {
      const { data: vaga } = await supabase.from('vagas').select('*').eq('id', vaga_id).single()

      if (vaga) {
        let criteriosText = 'Sem critérios definidos.'
        let localizacoesVaga: string[] = []
        let raioKm = 0

        if (vaga.criterios_qualificacao && typeof vaga.criterios_qualificacao === 'object') {
          const critObj = vaga.criterios_qualificacao as any
          criteriosText = critObj.texto_livre || JSON.stringify(critObj)
          if (Array.isArray(critObj.localizacoes) && critObj.localizacoes.length > 0) {
            localizacoesVaga = critObj.localizacoes.map((l: any) =>
              [l.endereco, l.cidade, l.estado].filter(Boolean).join(', '),
            )
          }
          raioKm = critObj.raio_km || 0
        } else if (typeof vaga.criterios_qualificacao === 'string') {
          criteriosText = vaga.criterios_qualificacao
        }

        const enderecoCV = extractedData.endereco || ''
        let menorDistanciaKm: number | null = null
        let qualificadoPorLocalizacao = true
        let distanciaCalculada = false

        const googleApiKey = Deno.env.get('GOOGLE_API_KEY')

        if (localizacoesVaga.length > 0 && raioKm > 0) {
          if (!enderecoCV) {
            qualificadoPorLocalizacao = false
            distanciaCalculada = false
          } else if (googleApiKey) {
            const callGoogleMaps = async (
              orig: string,
              dest: string,
              retries = 3,
            ): Promise<number | null> => {
              try {
                const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json')
                url.searchParams.append('origins', orig)
                url.searchParams.append('destinations', dest)
                url.searchParams.append('key', googleApiKey)
                url.searchParams.append('units', 'metric')
                const res = await fetch(url.toString(), { method: 'POST' })
                if (!res.ok) {
                  if (res.status === 503 && retries > 0) {
                    await new Promise((r) => setTimeout(r, 2000))
                    return callGoogleMaps(orig, dest, retries - 1)
                  }
                  return null
                }
                const data = await res.json()
                if (data.status === 'OK' && data.rows?.[0]?.elements?.[0]?.status === 'OK') {
                  return data.rows[0].elements[0].distance.value / 1000
                }
                return null
              } catch (e) {
                if (retries > 0) {
                  await new Promise((r) => setTimeout(r, 2000))
                  return callGoogleMaps(orig, dest, retries - 1)
                }
                return null
              }
            }

            for (const dest of localizacoesVaga) {
              const dist = await callGoogleMaps(enderecoCV, dest)
              if (dist !== null) {
                if (menorDistanciaKm === null || dist < menorDistanciaKm) menorDistanciaKm = dist
              }
            }

            if (menorDistanciaKm !== null) {
              qualificadoPorLocalizacao = menorDistanciaKm <= raioKm
              distanciaCalculada = true
            } else {
              qualificadoPorLocalizacao = false
            }
          }
        }

        const analyzePrompt = `Analise o currículo para a vaga de "${vaga.titulo}".
Descrição da vaga: ${vaga.descricao || 'Não informada'}
Critérios Textuais: ${criteriosText}
Localização do Candidato: ${enderecoCV || 'Não informada'}
Distância calculada: ${distanciaCalculada ? menorDistanciaKm?.toFixed(2) + ' km' : 'N/A'} (Raio aceito: ${raioKm} km)
Qualificado por localização: ${qualificadoPorLocalizacao}

Dados estruturados do currículo:
${JSON.stringify(extractedData)}

Retorne ESTRITAMENTE em formato JSON com as seguintes chaves:
{
  "resultado": "qualificado" | "nao_qualificado" | "revisar",
  "detalhes": {
    "pontos_fortes": ["string"],
    "pontos_fracos": ["string"],
    "aderencia": "percentual de aderência (ex: 80%)",
    "motivo": "string explicando a reprovação se aplicável, especialmente se for por localização"
  }
}`

        try {
          const analiseJson = await callOpenAIWithRetry(analyzePrompt)

          let statusFinal = analiseJson.resultado || 'revisar'
          let motivoFinal = analiseJson.detalhes?.motivo || ''

          if (localizacoesVaga.length > 0 && raioKm > 0) {
            if (!enderecoCV) {
              statusFinal = 'nao_qualificado'
              motivoFinal = `Reprovado por localização: Endereço não identificado no currículo. ${motivoFinal}`
            } else if (distanciaCalculada && !qualificadoPorLocalizacao) {
              statusFinal = 'nao_qualificado'
              if (
                !motivoFinal.toLowerCase().includes('localização') &&
                !motivoFinal.toLowerCase().includes('distância')
              ) {
                motivoFinal = `Reprovado por localização: Distância de ${menorDistanciaKm?.toFixed(2)} km excede o raio de ${raioKm} km. ${motivoFinal}`
              }
            }
          }

          if (analiseJson.detalhes) analiseJson.detalhes.motivo = motivoFinal

          const { data: novaAnalise, error: analiseError } = await supabase
            .from('analises')
            .insert({
              candidato_id: candidatoId,
              vaga_id: vaga.id,
              resultado: statusFinal,
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

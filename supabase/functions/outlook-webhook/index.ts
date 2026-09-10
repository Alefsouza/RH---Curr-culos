import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'
import { Buffer } from 'node:buffer'
import pdf from 'npm:pdf-parse@1.1.1'
import { findExistingCandidate } from '../_shared/candidates.ts'
import { performGoogleVisionPdfOcr } from '../_shared/ocr.ts'
import { resolveCandidateAge } from '../_shared/validation.ts'

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
      pdfText = data.text || ''
    } catch (err) {
      console.error('Erro ao ler PDF nativo:', err)
    }

    // Se o texto nativo do PDF for muito curto ou vazio, recorrer ao Google Vision OCR
    if (!pdfText.trim() || pdfText.trim().length < 50) {
      try {
        console.log(
          '[outlook-webhook] PDF com pouco/nenhum texto nativo. Chamando Google Vision OCR...',
        )
        const ocrResult = await performGoogleVisionPdfOcr(new Uint8Array(pdfBuffer))
        if (ocrResult && ocrResult.trim().length > 0) {
          pdfText = ocrResult
        }
      } catch (ocrErr: any) {
        console.warn('[outlook-webhook] Falha no Google Vision OCR:', ocrErr?.message)
      }
    }

    if (!pdfText.trim()) {
      return new Response(
        JSON.stringify({
          error: 'O arquivo PDF está vazio ou não contém texto legível mesmo após OCR.',
        }),
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
      prompt: string,
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
                'Você é um assistente de RH focado em estruturar dados de currículos. Retorne sempre um JSON válido.',
            },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
        })
        return JSON.parse(response.choices[0].message.content || '{}')
      } catch (error: any) {
        if (retries > 0 && isRetryableError(error)) {
          const delay = delays[3 - retries] ?? 8000
          console.log(
            `OpenAI erro (${error?.status || error?.message}), tentando novamente em ${delay}ms...`,
          )
          await new Promise((resolve) => setTimeout(resolve, delay))
          return callOpenAIWithRetry(prompt, retries - 1, delays)
        }
        throw error
      }
    }

    const extractionPrompt = `Extraia os seguintes dados do currículo: nome, email, telefones celulares, experiencia profissional, skills, formacao academica, endereço (cidade e estado ou completo), idade, data de nascimento, objetivo / cargo pretendido.
Extraia APENAS números de telefone celular brasileiros (DDD + 9 dígitos, começando com 9). Ignore telefones fixos. Formato: 11999999999.
Se algum dado não for encontrado, retorne null ou um array vazio.
Retorne ESTRITAMENTE em formato JSON com as seguintes chaves:
{
  "nome": "string ou null",
  "email": "string ou null",
  "telefones_celulares": ["string"],
  "endereco": "string ou null",
  "idade": "number ou null",
  "data_nascimento": "string ou null",
  "objetivo": "string ou null",
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
      if (extractedData) {
        if (!extractedData.data_nascimento && pdfText) {
          const birthDateRegex =
            /(?:nasc(?:ido|imento|ida)?(?:\s+em)?[:\s]+)?\b([0-3]?\d[\/\-\.][0-1]?\d[\/\-\.](?:19|20)\d{2})\b/i
          const matchDate = pdfText.match(birthDateRegex)
          if (matchDate && matchDate[1]) {
            extractedData.data_nascimento = matchDate[1]
          }
        }
        const calculatedAge = resolveCandidateAge(
          extractedData.idade,
          extractedData.data_nascimento,
        )
        if (calculatedAge !== null) {
          extractedData.idade = calculatedAge
        }
      }
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

    let telefonesArr: string[] = []
    if (Array.isArray(extractedData.telefones_celulares)) {
      telefonesArr = extractedData.telefones_celulares
    } else if (extractedData.telefone) {
      telefonesArr = [extractedData.telefone]
    }
    const extractedTelefone = telefonesArr.length > 0 ? telefonesArr.join(',') : null

    // 5 & 6. Deduplicação Robusta
    const existingCandidate = await findExistingCandidate(supabase, {
      userId: userId,
      nome: extractedData.nome,
      email: extractedData.email || null,
      telefones: telefonesArr,
    })

    let candidatoId: string

    if (existingCandidate) {
      candidatoId = existingCandidate.id
      console.log(
        `[outlook-webhook] Candidato existente encontrado (${existingCandidate.id}). Atualizando dados...`,
      )

      const { error: updateError } = await supabase
        .from('candidatos')
        .update({
          nome: extractedData.nome || existingCandidate.nome,
          email: extractedData.email || existingCandidate.email,
          telefone: extractedTelefone || existingCandidate.telefone,
          dados_extraidos: extractedData,
          duplicado_de: existingCandidate.id, // Armazena id do registro original quando atualizado por duplicidade
        })
        .eq('id', candidatoId)

      if (updateError) {
        console.error('Erro ao atualizar candidato duplicado no webhook:', updateError)
        throw updateError
      }
    } else {
      // 7. Inserir Candidato
      const { data: newCandidate, error: insertCandidateError } = await supabase
        .from('candidatos')
        .insert({
          nome: extractedData.nome,
          email: extractedData.email || null,
          telefone: extractedTelefone,
          dados_extraidos: extractedData,
          fonte: 'outlook',
          user_id: userId,
        })
        .select('id')
        .single()

      if (insertCandidateError) throw insertCandidateError
      candidatoId = newCandidate.id
    }

    // 8. Verificar Etapa Atual
    const { data: currentCandidate } = await supabase
      .from('candidatos')
      .select('etapa_id')
      .eq('id', candidatoId)
      .single()

    if (!currentCandidate?.etapa_id) {
      let { data: etapa } = await supabase
        .from('etapas')
        .select('id')
        .eq('user_id', userId)
        .ilike('nome', 'Triagem')
        .maybeSingle()

      if (!etapa) {
        const { data: newEtapa } = await supabase
          .from('etapas')
          .insert({
            nome: 'Triagem',
            ordem: 0,
            cor: '#6b7280',
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
    }

    // 9. Identificar vaga correspondente com salvaguardas (identify-vaga-from-cv)
    let assignedVagaId: string | null = null
    try {
      const identifyRes = await supabase.functions.invoke('identify-vaga-from-cv', {
        body: {
          candidato_id: candidatoId,
          user_id: userId,
          texto_cv: pdfText || '',
          dados_extraidos: extractedData,
        },
      })
      if (identifyRes.data?.vaga_id) {
        assignedVagaId = identifyRes.data.vaga_id
        await supabase.from('candidatos').update({ vaga_id: assignedVagaId }).eq('id', candidatoId)
      }
    } catch (idErr: any) {
      console.warn('[outlook-webhook] Erro ao identificar vaga:', idErr?.message)
    }

    // 10. Executar análise de critérios (analisar-cv-criterios)
    const analisesRealizadas = []
    if (assignedVagaId) {
      try {
        const critRes = await supabase.functions.invoke('analisar-cv-criterios', {
          body: {
            cv_id: candidatoId,
            vaga_id: assignedVagaId,
            user_id: userId,
          },
        })
        if (critRes.data?.data?.analise) {
          analisesRealizadas.push(critRes.data.data.analise)
        }
      } catch (critErr: any) {
        console.warn('[outlook-webhook] Erro ao analisar critérios:', critErr?.message)
      }
    } else {
      // Se nenhuma vaga foi identificada pelo job matcher, rodar análise para as vagas ativas abertas via analisar-cv-criterios
      const { data: activeVagas } = await supabase
        .from('vagas')
        .select('id')
        .eq('user_id', userId)
        .eq('ativa', true)

      if (activeVagas && activeVagas.length > 0) {
        for (const av of activeVagas) {
          try {
            const critRes = await supabase.functions.invoke('analisar-cv-criterios', {
              body: {
                cv_id: candidatoId,
                vaga_id: av.id,
                user_id: userId,
              },
            })
            if (critRes.data?.data?.analise) {
              analisesRealizadas.push(critRes.data.data.analise)
            }
          } catch (e: any) {
            console.error(`Erro ao analisar vaga ${av.id}:`, e?.message)
          }
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

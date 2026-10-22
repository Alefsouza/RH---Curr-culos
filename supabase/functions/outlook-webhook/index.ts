import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'
import { Buffer } from 'node:buffer'
import pdf from 'npm:pdf-parse@1.1.1'
import { findExistingCandidate } from '../_shared/candidates.ts'
import { performGoogleVisionPdfOcr } from '../_shared/ocr.ts'
import { resolveCandidateAge } from '../_shared/validation.ts'
import { extractCep, isTruncatedOrIncompleteAddress } from '../_shared/proximity.ts'
import { mergeExtractedCnh } from '../_shared/cnh.ts'

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

    const extractionPrompt = `Extraia os seguintes dados do currículo: nome, email, telefones celulares, cnh (ex: Categoria D, AB, CNH D), cnh_categoria (ex: D, E, AB, AD, AE, B, A), experiencia profissional, skills, formacao academica (incluindo cursos e credenciais como MOPP, Transporte Coletivo), endereço completo com logradouro, número, bairro, cidade, UF e CEP se existirem, idade, data de nascimento, objetivo / cargo pretendido.
Extraia APENAS números de telefone celular brasileiros (DDD + 9 dígitos, começando com 9). Ignore telefones fixos. ATENÇÃO: capture celulares mesmo com o 9º dígito separado por espaço ou traço (ex: "(11) 9 5386-9329"), normalizando SEMPRE para 11 dígitos com o 9 inicial (ex: "11953869329"), NUNCA descartando o 9 isolado.
No campo "endereco", traga o endereço mais completo possível (ex: "R. Timóteo, 88 - Jardim Paraguaçu, São Paulo - SP, 03938-050"). NUNCA trunque para apenas "Jardim - SP" ou apenas o bairro.
Preste extrema atenção na CNH / Habilitação e categoria (ex: "Habilitação: Categoria D", "CNH D", "Cat. D").
Se algum dado não for encontrado, retorne null ou um array vazio.
Retorne ESTRITAMENTE em formato JSON com as seguintes chaves:
{
  "nome": "string ou null",
  "email": "string ou null",
  "telefones_celulares": ["string"],
  "endereco": "string ou null",
  "cep": "string ou null",
  "idade": "number ou null",
  "data_nascimento": "string ou null",
  "cnh": "string ou null",
  "cnh_categoria": "string ou null",
  "objetivo": "string ou null",
  "experiencia_profissional": [{"cargo": "Motorista", "empresa": "Nome da Empresa", "periodo": "02/2023 - Atual", "atual": true}],
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

        // Se o nome vier vazio/null, rodar OCR automaticamente antes de salvar com fallback genérico
        let ocrBufferText: string | null = null
        const cleanWebhookName = sanitizeAndValidateName(extractedData.nome)
        if (!cleanWebhookName && pdfBuffer.length > 0) {
          try {
            console.log(
              '[outlook-webhook] Nome ausente ou vazio. Executando OCR Google Vision para identificar nome no cabeçalho...',
            )
            const ocrText = await performGoogleVisionPdfOcr(new Uint8Array(pdfBuffer))
            ocrBufferText = ocrText
            if (ocrText && ocrText.trim().length > 20) {
              const headerPrompt = `Identifique com precisão o NOME COMPLETO REAL da pessoa física deste currículo a partir do texto lido via OCR (Google Vision). O nome costuma ser o título principal no topo da página.
Retorne um JSON estrito: {"nome": "Nome Completo" ou null, "email": "email" ou null, "telefone": "telefone" ou null, "cnh": "cnh" ou null, "idade": número ou null}

Texto OCR:
${ocrText.substring(0, 15000)}`
              const headerExtracted = await callOpenAIWithRetry(headerPrompt)
              if (headerExtracted?.nome) {
                const validatedOcrName = sanitizeAndValidateName(headerExtracted.nome)
                if (validatedOcrName) {
                  extractedData.nome = validatedOcrName
                }
              }
              if (headerExtracted?.email && !extractedData?.email)
                extractedData.email = headerExtracted.email
              if (headerExtracted?.telefone && !extractedData?.telefone)
                extractedData.telefone = headerExtracted.telefone
              if (headerExtracted?.cnh && !extractedData?.cnh)
                extractedData.cnh = headerExtracted.cnh
              if (headerExtracted?.idade && !extractedData?.idade)
                extractedData.idade = headerExtracted.idade
            }
          } catch (ocrNameErr: any) {
            console.warn(
              '[outlook-webhook] Falha no OCR para recuperação de nome:',
              ocrNameErr?.message,
            )
          }
        }

        // Pós-processamento determinístico de CNH / Habilitação com fallback Regex
        extractedData = mergeExtractedCnh(extractedData, [pdfText, ocrBufferText])

        if (!extractedData.cep && pdfText) {
          const foundCep = extractCep(pdfText)
          if (foundCep) extractedData.cep = foundCep
        }
        if (
          extractedData.cep &&
          extractedData.endereco &&
          typeof extractedData.endereco === 'string'
        ) {
          if (!extractedData.endereco.includes(extractedData.cep)) {
            extractedData.endereco = `${extractedData.endereco}, ${extractedData.cep}`
          }
        }

        // Se o endereço veio incompleto ou truncado e ainda não tínhamos feito OCR no webhook
        if (
          (!extractedData.endereco ||
            isTruncatedOrIncompleteAddress(String(extractedData.endereco))) &&
          pdfBuffer.length > 0 &&
          !ocrBufferText
        ) {
          try {
            console.log(
              '[outlook-webhook] Endereço incompleto/truncado, executando OCR para capturar cabeçalho/endereço...',
            )
            const ocrText = await performGoogleVisionPdfOcr(new Uint8Array(pdfBuffer))
            if (ocrText && ocrText.trim().length > 30) {
              const ocrCep = extractCep(ocrText)
              if (ocrCep && !extractedData.cep) {
                extractedData.cep = ocrCep
              }
            }
          } catch (e: any) {
            console.warn('[outlook-webhook] Aviso no OCR secundário:', e?.message)
          }
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

    // Se mesmo após o OCR o nome não aparecer, usar fallback seguro antes de rejeitar ou usar "Candidato"
    const validatedFinalName = sanitizeAndValidateName(extractedData.nome)
    if (!validatedFinalName) {
      if (extractedData.email) {
        const emailPrefix = extractedData.email.split('@')[0]
        const formattedPrefix = emailPrefix
          .replace(/[._-]/g, ' ')
          .replace(/\b\w/g, (l: string) => l.toUpperCase())
        extractedData.nome = sanitizeAndValidateName(formattedPrefix) || 'Candidato'
      } else {
        extractedData.nome = 'Candidato'
      }
    } else {
      extractedData.nome = validatedFinalName
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
      if (identifyRes.data?.descartado) {
        // Regra 4: fora do raio de todas as vagas
        await supabase
          .from('candidatos')
          .update({
            vaga_id: null,
            etapa_id: null,
            ativo_kanban: false,
            motivo_inativo: 'fora do raio de todas as vagas',
            proximidade: 'fora_raio',
          })
          .eq('id', candidatoId)
      } else if (identifyRes.data?.aguardando_vaga) {
        // Regra 3: aguardando vaga adequada
        await supabase
          .from('candidatos')
          .update({
            vaga_id: null,
            etapa_id: null,
            ativo_kanban: false,
            motivo_inativo: 'aguardando vaga adequada',
          })
          .eq('id', candidatoId)
      } else if (identifyRes.data?.vaga_id) {
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
            enable_cascade: true,
          },
        })
        if (critRes.data?.data?.analise) {
          analisesRealizadas.push(critRes.data.data.analise)
        }
      } catch (critErr: any) {
        console.warn('[outlook-webhook] Erro ao analisar critérios:', critErr?.message)
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

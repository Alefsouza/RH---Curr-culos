import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'
import { corsHeaders } from '../_shared/cors.ts'
import {
  normalizePhone,
  isValidBrazilianPhone,
  sanitizeAndValidateName,
  sanitizeAndValidateEmail,
} from '../_shared/validation.ts'
import { extractRawTextFromDocxBytes } from '../_shared/docx.ts'

// Extrai texto bruto contido em streams/objetos do PDF via regex com suporte a UTF-8
function extractAsciiTextFromPdfBytes(bytes: Uint8Array): string {
  let raw = ''
  try {
    const textDecoderUtf8 = new TextDecoder('utf-8', { fatal: false })
    raw = textDecoderUtf8.decode(bytes)
  } catch {
    const textDecoderLatin1 = new TextDecoder('latin1')
    raw = textDecoderLatin1.decode(bytes)
  }

  const textChunks: string[] = []

  const btMatches = raw.matchAll(/BT[\s\S]*?ET/g)
  for (const match of btMatches) {
    const block = match[0]
    const literalMatches = block.matchAll(/\((.*?)\)/g)
    for (const lit of literalMatches) {
      const decoded = lit[1]
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\([()\\])/g, '$1')
      if (decoded.trim().length > 0) {
        textChunks.push(decoded)
      }
    }
    const hexMatches = block.matchAll(/<([0-9a-fA-F\s]+)>/g)
    for (const hex of hexMatches) {
      const cleanHex = hex[1].replace(/\s+/g, '')
      if (cleanHex.length % 2 === 0 && cleanHex.length >= 2) {
        try {
          const hexBytes = new Uint8Array(cleanHex.length / 2)
          for (let k = 0; k < cleanHex.length; k += 2) {
            hexBytes[k / 2] = parseInt(cleanHex.substring(k, k + 2), 16)
          }
          const decodedHexStr = new TextDecoder('utf-8', { fatal: false }).decode(hexBytes)
          if (decodedHexStr.trim().length > 0) {
            textChunks.push(decodedHexStr)
          }
        } catch {
          let str = ''
          for (let k = 0; k < cleanHex.length; k += 2) {
            const code = parseInt(cleanHex.substring(k, k + 2), 16)
            if (code >= 32) {
              str += String.fromCharCode(code)
            }
          }
          if (str.trim().length > 0) {
            textChunks.push(str)
          }
        }
      }
    }
  }

  return textChunks.join(' ').replace(/\s+/g, ' ').trim()
}

// Extrai e limpa nome a partir do nome do arquivo (ex: "curriculo_joao_silva.pdf" -> "Joao Silva")
function extractNameFromFileName(filePath: string): string | null {
  if (!filePath) return null
  const baseName = filePath.split('/').pop()?.split('\\').pop() || filePath
  const nameWithoutExt = baseName.replace(/\.[^/.]+$/, '')
  let cleaned = nameWithoutExt
    .replace(/^\d+[-_]?/, '')
    .replace(/[-_]\d+$/, '')
    .replace(/[-_][a-z0-9]{4,12}$/i, '')
    .replace(/[._-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Se o nome resultante contiver dígitos ou for apenas números/hash/termos genéricos
  if (/\d/.test(cleaned)) {
    return null
  }

  if (/^(curriculo|curriculos|cv|resume|documento|doc|scan|arquivo|\d+)$/i.test(cleaned)) {
    return null
  }

  cleaned = cleaned.replace(/^(curr[ií]culo|cv|resume)(\s+de)?\s+/i, '').trim()

  if (/\d/.test(cleaned)) {
    return null
  }

  if (cleaned.length >= 3 && /[a-zA-ZÀ-ÿ]/.test(cleaned)) {
    return cleaned.replace(/\b\w/g, (l) => l.toUpperCase())
  }
  return null
}

// Extrai e formata nome a partir de e-mail (ex: "joao.silva@gmail.com" -> "Joao Silva")
function extractNameFromEmail(email: string | null | undefined): string | null {
  if (!email || !email.includes('@')) return null
  const local = email.split('@')[0].trim()
  if (
    !local ||
    /^(contato|rh|admin|financeiro|curriculo|candidato|user|usuario|info|jobs)$/i.test(local)
  ) {
    return null
  }

  const cleaned = local
    .replace(/\d+$/, '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (cleaned.length >= 2 && /[a-zA-ZÀ-ÿ]/.test(cleaned)) {
    return cleaned.replace(/\b\w/g, (l) => l.toUpperCase())
  }
  return null
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

    // 2. Parse Document (Native Deno APIs)
    const arrayBuffer = await fileData.arrayBuffer()
    const fileBytes = new Uint8Array(arrayBuffer)
    let extractedText = ''

    if (filePath.toLowerCase().endsWith('.docx')) {
      extractedText = await extractRawTextFromDocxBytes(fileBytes)
    } else {
      extractedText = extractAsciiTextFromPdfBytes(fileBytes)
    }

    const hasSufficientText = extractedText && extractedText.trim().length >= 40

    // 3. OpenAI Extraction
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
      return (
        msg.includes('rate limit') ||
        msg.includes('429') ||
        msg.includes('timeout') ||
        msg.includes('fetch failed')
      )
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
                'Você é um assistente sênior de RH focado em estruturar dados de currículos em português brasileiro. NUNCA invente dados nem use nomes fictícios (ex: "Candidato Desconhecido", "João da Silva"). Retorne sempre um JSON válido.',
            },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
        })
        return JSON.parse(response.choices[0].message.content || '{}')
      } catch (error: any) {
        if (retries > 0 && isRetryableError(error)) {
          const delay = delays[3 - retries] ?? 8000
          console.log(`OpenAI erro, retentando em ${delay}ms...`)
          await new Promise((resolve) => setTimeout(resolve, delay))
          return callOpenAIWithRetry(prompt, retries - 1, delays)
        }
        throw error
      }
    }

    let extractedData: any = {
      nome: null,
      email: null,
      telefones_celulares: [],
      endereco: null,
      experiencia_profissional: [],
      skills: [],
      formacao_academica: [],
    }

    if (hasSufficientText) {
      const extractionPrompt = `Extraia os seguintes dados do currículo:
- nome: Nome completo REAL do candidato, ou null se não identificado
- email: Endereço de e-mail REAL, ou null se não identificado
- telefones_celulares: Lista de telefones celulares brasileiros REAIS com DDD (ex: ["11987654321"]) ou [] se nenhum
- endereco: Cidade e estado ou endereço completo, ou null se não identificado
- experiencia_profissional: Lista de experiências anteriores com cargos e empresas, ou []
- skills: Lista de habilidades técnicas e competências, ou []
- formacao_academica: Lista de cursos e escolaridade, ou []

IMPORTANTE:
1. NUNCA invente dados (evite "Candidato Desconhecido", "João da Silva", "11999999999", "exemplo@email.com"). Se não constar com clareza, use null.
2. Evite duplicação de palavras no nome (ex: "Lucas Lucas").
3. NUNCA use a string "string ou null" ou "string". Use null real.

Formato JSON estrito esperado:
{
  "nome": null,
  "email": null,
  "telefones_celulares": [],
  "endereco": null,
  "experiencia_profissional": [],
  "skills": [],
  "formacao_academica": []
}

Texto extraído do currículo:
${extractedText.substring(0, 18000)}`

      try {
        extractedData = await callOpenAIWithRetry(extractionPrompt)
      } catch (err: any) {
        console.error('Erro na chamada da OpenAI:', err)
      }
    }

    let cleanName = sanitizeAndValidateName(extractedData?.nome || nome)
    const isDocx = filePath.toLowerCase().endsWith('.docx')

    if (!cleanName && !isDocx && fileBytes.length > 0 && fileBytes.length < 15 * 1024 * 1024) {
      try {
        console.log(`[process-resume] Tentando visão computacional GPT-4o para ${filePath}...`)
        let binaryStr = ''
        const len = fileBytes.byteLength
        for (let i = 0; i < len; i++) {
          binaryStr += String.fromCharCode(fileBytes[i])
        }
        const base64Data = btoa(binaryStr)

        const originalFileName = filePath.split('/').pop()?.split('\\').pop() || 'curriculo.pdf'

        const visionResponse = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content:
                'Você é um assistente de RH especializado em leitura de currículos visuais, fotos e PDFs escaneados. Preserve a acentuação original brasileira. NUNCA invente dados. Se não identificar, retorne null. Responda em JSON.',
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Analise visualmente este currículo/documento e extraia:
{
  "nome": "Nome completo REAL do candidato ou null",
  "email": "Email ou null",
  "telefones_celulares": ["telefones"],
  "endereco": "endereço ou null",
  "experiencia_profissional": ["experiências"],
  "skills": ["habilidades"],
  "formacao_academica": ["formações"]
}`,
                },
                {
                  type: 'file',
                  file: {
                    filename: originalFileName,
                    file_data: `data:application/pdf;base64,${base64Data}`,
                  },
                },
              ] as any,
            },
          ],
          response_format: { type: 'json_object' },
        })

        const visionContent = visionResponse.choices[0]?.message?.content || '{}'
        const visionData = JSON.parse(visionContent)
        if (visionData) {
          extractedData = {
            ...extractedData,
            ...visionData,
            ...(visionData.nome ? { nome: visionData.nome } : {}),
            ...(visionData.email ? { email: visionData.email } : {}),
          }
          cleanName = sanitizeAndValidateName(visionData.nome) || cleanName
        }
      } catch (visionErr: any) {
        console.warn(`[process-resume] Visão GPT-4o falhou:`, visionErr?.message)
      }
    }

    const cleanEmail = sanitizeAndValidateEmail(extractedData?.email || email)

    let finalNome = cleanName
    if (!finalNome) {
      const emailDerived = extractNameFromEmail(cleanEmail)
      const validEmailDerived = sanitizeAndValidateName(emailDerived)
      if (validEmailDerived) {
        finalNome = validEmailDerived
      }
    }
    if (!finalNome) {
      const fileDerived = extractNameFromFileName(filePath)
      const validFileDerived = sanitizeAndValidateName(fileDerived)
      if (validFileDerived) {
        finalNome = validFileDerived
      }
    }
    if (!finalNome) {
      finalNome = 'Candidato'
    }

    let telefonesArr: string[] = []
    if (Array.isArray(extractedData.telefones_celulares)) {
      telefonesArr = extractedData.telefones_celulares
    } else if (extractedData.telefone) {
      telefonesArr = [extractedData.telefone]
    } else if (telefone) {
      telefonesArr = [telefone]
    }

    const rawTelefone = telefonesArr.length > 0 ? telefonesArr.join(',') : null
    let finalTelefone = null
    if (rawTelefone) {
      const parts = rawTelefone
        .split(',')
        .map((t: string) => t.trim())
        .filter(Boolean)
      const normalizedParts = parts
        .map((t: string) => {
          const n = normalizePhone(t)
          return n && isValidBrazilianPhone(n) ? n : null
        })
        .filter((n): n is string => Boolean(n))
      const uniqueParts = Array.from(new Set(normalizedParts))
      finalTelefone = uniqueParts.length > 0 ? uniqueParts.join(',') : null
    }

    const finalEmail = cleanEmail

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
        .ilike('nome', 'Triagem')
        .maybeSingle()

      if (!etapa) {
        const { data: newEtapa } = await supabase
          .from('etapas')
          .insert({
            nome: 'Triagem',
            ordem: 0,
            cor: '#6b7280',
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
      try {
        const critRes = await supabase.functions.invoke('analisar-cv-criterios', {
          body: {
            cv_id: candidatoId,
            vaga_id: vaga_id,
            user_id: user_id,
          },
        })
        if (critRes.data?.data?.analise) {
          analisesRealizadas.push(critRes.data.data.analise)
        }
      } catch (e: any) {
        console.error(`Erro ao analisar a vaga ${vaga_id}:`, e?.message)
      }
    }

    // 8. Success Response
    return new Response(
      JSON.stringify({
        success: true,
        candidato_id: candidatoId,
        candidato_nome: finalNome,
        dados_extraidos: {
          ...extractedData,
          nome: finalNome,
          email: finalEmail,
          telefone: finalTelefone,
        },
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

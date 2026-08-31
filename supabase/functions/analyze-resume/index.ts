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

// Extrai texto legível de arquivo DOCX sem bibliotecas externas
function extractRawTextFromDocxBytes(bytes: Uint8Array): string {
  try {
    const decoder = new TextDecoder('utf-8', { fatal: false })
    const content = decoder.decode(bytes)
    const textMatches = content.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gi)
    const chunks: string[] = []
    for (const match of textMatches) {
      if (match[1] && match[1].trim()) {
        chunks.push(match[1])
      }
    }
    if (chunks.length > 0) {
      return chunks.join(' ').replace(/\s+/g, ' ').trim()
    }
    const stripped = content.replace(/<[^>]+>/g, ' ').replace(/[^\x20-\x7E\xC0-\xFF\n\r\t]/g, ' ')
    return stripped.replace(/\s+/g, ' ').trim()
  } catch {
    return ''
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('--- Iniciando processamento do currículo ---')
    const bodyText = await req.text()
    let body
    try {
      body = JSON.parse(bodyText)
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Payload inválido. Formato JSON esperado.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { filePath, nome, email, telefone, vaga_id, user_id } = body

    if (!filePath) {
      return new Response(
        JSON.stringify({ error: 'O caminho do arquivo (filePath) é obrigatório.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!user_id) {
      return new Response(JSON.stringify({ error: 'Identificador do usuário é obrigatório.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (vaga_id) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!uuidRegex.test(vaga_id)) {
        return new Response(
          JSON.stringify({ error: 'Vaga inválida. Selecione uma vaga válida.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const openaiKey = Deno.env.get('OPENAI_KEY') || Deno.env.get('OPENIA_KEY')

    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: 'Configuração incompleta: chave da OpenAI não configurada.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1. Download do arquivo do Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('curriculos')
      .download(filePath)

    if (downloadError || !fileData) {
      return new Response(
        JSON.stringify({
          error: 'Erro ao acessar o arquivo enviado no Storage.',
          detalhes: downloadError,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 2. Extração de texto usando APIs nativas do Deno
    const arrayBuffer = await fileData.arrayBuffer()
    const fileBytes = new Uint8Array(arrayBuffer)
    let extractedText = ''

    if (filePath.toLowerCase().endsWith('.docx')) {
      extractedText = extractRawTextFromDocxBytes(fileBytes)
    } else {
      extractedText = extractAsciiTextFromPdfBytes(fileBytes)
    }

    if (!extractedText || extractedText.trim().length < 50) {
      return new Response(
        JSON.stringify({
          error:
            'O arquivo não contém texto legível suficiente (< 50 caracteres ou documento escaneado/imagem).',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 3. OpenAI Extraction
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
                'Você é um assistente sênior de RH focado em estruturar currículos com máxima precisão. Preserve rigorosamente todos os acentos e grafias do português brasileiro (ç, ã, õ, etc.). NUNCA invente dados ou nomes fictícios (ex: "Candidato Desconhecido", "João da Silva"). Se não conseguir identificar o nome real com certeza, retorne null. Não duplique nomes (evite "Lucas Lucas"). Responda sempre em JSON válido.',
            },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
        })
        return JSON.parse(response.choices[0].message.content || '{}')
      } catch (error: any) {
        if (retries > 0 && isRetryableError(error)) {
          const delay = delays[3 - retries] ?? 8000
          console.log(`OpenAI retry em ${delay}ms...`)
          await new Promise((resolve) => setTimeout(resolve, delay))
          return callOpenAIWithRetry(prompt, retries - 1, delays)
        }
        throw error
      }
    }

    const extractionPrompt = `Analise o texto do currículo e extraia:
- nome: Nome completo REAL extraído do currículo, ou null se não identificado
- email: Endereço de e-mail REAL válido, ou null se não identificado
- telefones_celulares: Lista de telefones celulares brasileiros REAIS com DDD (ex: ["11987654321"]) ou [] se nenhum
- telefone: Telefone celular principal ou null
- endereco: Cidade, estado ou endereço completo, ou null se não identificado
- experiencia_profissional: Lista de experiências anteriores com cargos e empresas, ou []
- skills: Lista de habilidades técnicas e competências, ou []
- formacao_academica: Lista de cursos e formações, ou []

IMPORTANTE:
1. NUNCA invente dados. Não use "Candidato Desconhecido", "João da Silva", emails com @example.com/@email.com ou telefones fictícios.
2. NUNCA retorne a string literal "string ou null" ou "string". Use null real.

Formato JSON estrito esperado:
{
  "nome": null,
  "email": null,
  "telefones_celulares": [],
  "telefone": null,
  "endereco": null,
  "experiencia_profissional": [],
  "skills": [],
  "formacao_academica": []
}

Texto extraído do currículo:
${extractedText.substring(0, 20000)}`

    let extractedData: any
    try {
      extractedData = await callOpenAIWithRetry(extractionPrompt)
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          error: 'Serviço de Inteligência Artificial indisponível no momento.',
          detalhes: err.message,
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const cleanName = sanitizeAndValidateName(extractedData.nome || nome)
    const cleanEmail = sanitizeAndValidateEmail(extractedData.email || email)

    if (!cleanName) {
      return new Response(
        JSON.stringify({
          error: 'Não foi possível extrair um nome de candidato válido do currículo.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // Normalização de telefone
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
      const validParts = parts
        .map((t: string) => {
          const n = normalizePhone(t)
          return n && isValidBrazilianPhone(n) ? n : null
        })
        .filter((n): n is string => Boolean(n))
      const uniqueParts = Array.from(new Set(validParts))
      finalTelefone = uniqueParts.length > 0 ? uniqueParts.join(',') : null
    }

    const finalNome = cleanName
    const finalEmail = cleanEmail

    // Deduplicação
    const orConditions = []
    if (finalEmail) {
      orConditions.push(`email.eq."${finalEmail.replace(/"/g, '')}"`)
    }
    if (finalTelefone) {
      const tels = finalTelefone
        .split(',')
        .map((t: string) => t.trim())
        .filter(Boolean)
      for (const tel of tels) {
        orConditions.push(`telefone.ilike."%${tel.replace(/"/g, '')}%"`)
      }
    }

    const { data: publicUrlData } = supabase.storage.from('curriculos').getPublicUrl(filePath)
    let finalVagaId = vaga_id

    // Se não veio vaga_id, tenta identificar vaga compatível
    if (!finalVagaId) {
      try {
        const identifyRes = await supabase.functions.invoke('identify-vaga-from-cv', {
          body: {
            user_id: user_id,
            texto_cv: extractedText,
            dados_extraidos: extractedData,
          },
        })
        finalVagaId = identifyRes.data?.vaga_id || null
      } catch (idErr: any) {
        console.warn('Erro ao identificar vaga:', idErr?.message)
      }
    }

    let candidatoId: string | null = null

    if (orConditions.length > 0) {
      const { data: duplicates } = await supabase
        .from('candidatos')
        .select('id, vaga_id, etapa_id')
        .eq('user_id', user_id)
        .or(orConditions.join(','))
        .limit(1)

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
            vaga_id: finalVagaId || duplicates[0].vaga_id,
          })
          .eq('id', candidatoId)
      }
    }

    if (!candidatoId) {
      const { data: newCandidate, error: insertCandidateError } = await supabase
        .from('candidatos')
        .insert({
          nome: finalNome,
          email: finalEmail,
          telefone: finalTelefone,
          fonte: 'site',
          curriculo_url: publicUrlData.publicUrl,
          dados_extraidos: extractedData,
          vaga_id: finalVagaId,
          user_id: user_id,
        })
        .select('id')
        .single()

      if (insertCandidateError || !newCandidate) {
        throw new Error(`Erro ao cadastrar candidato: ${insertCandidateError?.message}`)
      }
      candidatoId = newCandidate.id
    }

    // Atribuir etapa Triagem se não tiver
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

    // Executar análise de critérios
    const analisesRealizadas = []
    if (finalVagaId) {
      try {
        const critRes = await supabase.functions.invoke('analisar-cv-criterios', {
          body: {
            cv_id: candidatoId,
            vaga_id: finalVagaId,
            user_id: user_id,
          },
        })
        if (critRes.data?.data?.analise) {
          analisesRealizadas.push(critRes.data.data.analise)
        }
      } catch (critErr: any) {
        console.warn('Erro ao analisar critérios:', critErr?.message)
      }
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
    console.error('Erro Fatal:', error)
    return new Response(
      JSON.stringify({
        error: 'Ocorreu um erro interno ao processar o currículo.',
        detalhes: error.message,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

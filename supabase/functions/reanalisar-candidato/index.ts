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

// Extrai caminho relativo do storage a partir de URL pública ou storage path
function extractStoragePathFromCurriculoUrl(urlOrPath: string): string | null {
  if (!urlOrPath) return null
  const marker = '/storage/v1/object/public/curriculos/'
  const idx = urlOrPath.indexOf(marker)
  if (idx !== -1) {
    return decodeURIComponent(urlOrPath.substring(idx + marker.length))
  }
  const signMarker = '/storage/v1/object/sign/curriculos/'
  const sIdx = urlOrPath.indexOf(signMarker)
  if (sIdx !== -1) {
    const rest = urlOrPath.substring(sIdx + signMarker.length)
    return decodeURIComponent(rest.split('?')[0])
  }
  if (!urlOrPath.startsWith('http://') && !urlOrPath.startsWith('https://')) {
    return urlOrPath
  }
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const { candidate_id, force_reextract } = body

    if (!candidate_id) {
      return new Response(JSON.stringify({ error: 'candidate_id é obrigatório.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const openaiKey =
      Deno.env.get('OPENAI_KEY') ||
      Deno.env.get('OPENAI_API_KEY') ||
      Deno.env.get('OPENIA_KEY') ||
      ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: candidato, error } = await supabase
      .from('candidatos')
      .select('id, nome, email, telefone, vaga_id, user_id, dados_extraidos, curriculo_url')
      .eq('id', candidate_id)
      .single()

    if (error || !candidato) {
      return new Response(
        JSON.stringify({ error: 'Candidato não encontrado. Verifique o ID e tente novamente.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    let effectiveUserId = candidato.user_id
    if (!effectiveUserId) {
      const { data: adminUser } = await supabase
        .from('usuarios')
        .select('id')
        .order('criado_em', { ascending: true })
        .limit(1)
        .maybeSingle()
      effectiveUserId = adminUser?.id || ''
    }

    let currentNome = candidato.nome
    let currentEmail = candidato.email
    let currentTelefone = candidato.telefone
    let currentDadosExtraidos =
      typeof candidato.dados_extraidos === 'object' && candidato.dados_extraidos !== null
        ? { ...candidato.dados_extraidos }
        : {}

    // 1. Verificar se o nome é inválido ou se foi forçada a reextração completa
    const validCurrentName = sanitizeAndValidateName(currentNome)
    const validExtractedName = sanitizeAndValidateName(currentDadosExtraidos.nome)
    const needsReExtraction =
      force_reextract ||
      !validCurrentName ||
      !validExtractedName ||
      !currentDadosExtraidos.skills ||
      (Array.isArray(currentDadosExtraidos.skills) &&
        currentDadosExtraidos.skills.length === 0 &&
        !currentEmail)

    if (needsReExtraction && candidato.curriculo_url && openaiKey) {
      console.log(
        `[reanalisar-candidato] Candidato ${candidato.id} precisa de nova extração de dados do documento.`,
      )
      const storagePath = extractStoragePathFromCurriculoUrl(candidato.curriculo_url)

      if (storagePath) {
        try {
          const { data: fileBlob, error: dlErr } = await supabase.storage
            .from('curriculos')
            .download(storagePath)

          if (!dlErr && fileBlob) {
            const arrayBuffer = await fileBlob.arrayBuffer()
            const fileBytes = new Uint8Array(arrayBuffer)
            const isDocx = storagePath.toLowerCase().endsWith('.docx')
            let extractedText = isDocx
              ? await extractRawTextFromDocxBytes(fileBytes)
              : extractAsciiTextFromPdfBytes(fileBytes)

            const openai = new OpenAI({ apiKey: openaiKey })

            let newlyExtracted: any = null

            // Tentativa 1: Via texto bruto extraído
            if (extractedText && extractedText.trim().length >= 30) {
              const systemPrompt =
                'Você é um assistente sênior de RH especialista em análise de currículos em português brasileiro. NUNCA invente dados fictícios ou use placeholders como "Candidato Desconhecido", "Nome Completo Exemplo", "João da Silva", "string ou null". Se não identificar o nome real do candidato, retorne null. Preserve rigorosamente acentos e grafia original. Retorne SEMPRE JSON válido.'

              const promptText = `Extraia todos os dados cadastrais e profissionais do currículo:
- nome: Nome completo REAL do candidato, ou null se não identificado
- email: E-mail REAL do candidato, ou null se não identificado
- telefones_celulares: Lista de telefones celulares brasileiros REAIS com DDD (ex: ["11987654321"]) ou [] se nenhum
- telefone: Telefone principal ou null
- endereco: Endereço completo ou cidade/estado, ou null se não identificado
- resumo_cv: Resumo das qualificações, ou null
- experiencia_profissional: Lista de experiências anteriores, ou []
- skills: Lista de habilidades técnicas e competências, ou []
- formacao_academica: Lista de cursos e escolaridade, ou []

Texto do currículo:
${extractedText.substring(0, 18000)}`

              const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: promptText },
                ],
                response_format: { type: 'json_object' },
              })

              const rawContent = response.choices[0]?.message?.content || '{}'
              newlyExtracted = JSON.parse(rawContent)
            }

            // Tentativa 2: Se texto foi insuficiente ou nome ainda veio nulo e não é docx, usar GPT-4o com visão
            const parsedName = sanitizeAndValidateName(newlyExtracted?.nome)
            if (
              !parsedName &&
              !isDocx &&
              fileBytes.length > 0 &&
              fileBytes.length < 15 * 1024 * 1024
            ) {
              try {
                console.log(
                  `[reanalisar-candidato] Tentando extração avançada com visão para o candidato ${candidato.id}...`,
                )
                // Converter os bytes do PDF em base64 data URL
                // Obs: OpenAI aceita PDFs e imagens diretamente no GPT-4o
                let binaryStr = ''
                const len = fileBytes.byteLength
                for (let i = 0; i < len; i++) {
                  binaryStr += String.fromCharCode(fileBytes[i])
                }
                const base64Data = btoa(binaryStr)

                const visionResponse = await openai.chat.completions.create({
                  model: 'gpt-4o',
                  messages: [
                    {
                      role: 'system',
                      content:
                        'Você é um assistente de RH de alta precisão. Analise o documento em anexo (currículo) e extraia todos os dados reais. NUNCA invente nomes nem use placeholders (como "Candidato Desconhecido" ou "Nome Exemplo"). Se não encontrar o nome no documento, retorne null. Retorne SEMPRE JSON válido.',
                    },
                    {
                      role: 'user',
                      content: [
                        {
                          type: 'text',
                          text: `Analise visualmente este currículo e extraia rigorosamente:
{
  "nome": "Nome completo REAL da pessoa ou null",
  "email": "email real ou null",
  "telefones_celulares": ["telefones REAIS"],
  "endereco": "endereço ou cidade/estado ou null",
  "resumo_cv": "resumo ou null",
  "experiencia_profissional": ["experiências"],
  "skills": ["habilidades"],
  "formacao_academica": ["formações"]
}`,
                        },
                        {
                          type: 'image_url',
                          image_url: {
                            url: `data:application/pdf;base64,${base64Data}`,
                          },
                        },
                      ] as any,
                    },
                  ],
                  response_format: { type: 'json_object' },
                })

                const visionContent = visionResponse.choices[0]?.message?.content || '{}'
                const visionExtracted = JSON.parse(visionContent)
                if (visionExtracted?.nome) {
                  newlyExtracted = { ...newlyExtracted, ...visionExtracted }
                }
              } catch (visionErr: any) {
                console.warn(
                  `[reanalisar-candidato] Erro na extração com visão:`,
                  visionErr?.message,
                )
              }
            }

            if (newlyExtracted) {
              const cleanName = sanitizeAndValidateName(newlyExtracted.nome)
              const cleanEmail = sanitizeAndValidateEmail(newlyExtracted.email)

              let telefonesArr: string[] = []
              if (Array.isArray(newlyExtracted.telefones_celulares)) {
                telefonesArr = newlyExtracted.telefones_celulares
              } else if (newlyExtracted.telefone) {
                telefonesArr = [newlyExtracted.telefone]
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

              const candidateUpdate: any = {}
              if (cleanName) {
                candidateUpdate.nome = cleanName
                currentNome = cleanName
              } else if (!validCurrentName) {
                // Se o nome atual era inválido ("Candidato Desconhecido") e não achou nome, não deixar como "Desconhecido" se tiver fallback melhor
                if (cleanEmail) {
                  const prefix = cleanEmail.split('@')[0]
                  const formattedPrefix = prefix
                    .replace(/[._-]/g, ' ')
                    .replace(/\b\w/g, (l) => l.toUpperCase())
                  candidateUpdate.nome = formattedPrefix
                  currentNome = formattedPrefix
                }
              }

              if (cleanEmail && !currentEmail) {
                candidateUpdate.email = cleanEmail
                currentEmail = cleanEmail
              }

              if (finalTelefone && !currentTelefone) {
                candidateUpdate.telefone = finalTelefone
                currentTelefone = finalTelefone
              }

              currentDadosExtraidos = {
                ...currentDadosExtraidos,
                ...newlyExtracted,
                ...(cleanName ? { nome: cleanName } : {}),
                ...(cleanEmail ? { email: cleanEmail } : {}),
                ...(finalTelefone ? { telefones_celulares: finalTelefone.split(',') } : {}),
              }
              candidateUpdate.dados_extraidos = currentDadosExtraidos

              if (Object.keys(candidateUpdate).length > 0) {
                await supabase.from('candidatos').update(candidateUpdate).eq('id', candidato.id)
                console.log(
                  `[reanalisar-candidato] Candidato ${candidato.id} atualizado com novos dados:`,
                  candidateUpdate,
                )
              }
            }
          }
        } catch (extractErr: any) {
          console.error(
            `[reanalisar-candidato] Erro durante reextração de dados do storage:`,
            extractErr?.message,
          )
        }
      }
    } else if (!validCurrentName && currentEmail) {
      // Fallback de limpeza caso não tenha storage ou OpenAI
      const prefix = currentEmail.split('@')[0]
      const formattedPrefix = prefix.replace(/[._-]/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
      await supabase.from('candidatos').update({ nome: formattedPrefix }).eq('id', candidato.id)
      currentNome = formattedPrefix
    }

    let vagaId = candidato.vaga_id

    if (!vagaId) {
      const identifyRes = await fetch(`${supabaseUrl}/functions/v1/identify-vaga-from-cv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseKey}` },
        body: JSON.stringify({
          candidato_id: candidato.id,
          user_id: effectiveUserId,
          dados_extraidos: currentDadosExtraidos,
        }),
      })

      const identifyData = await identifyRes.json()

      if (identifyData.error) {
        return new Response(JSON.stringify({ error: identifyData.error }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (identifyData.vaga_id) {
        const { error: updateError } = await supabase
          .from('candidatos')
          .update({ vaga_id: identifyData.vaga_id })
          .eq('id', candidato.id)

        if (updateError) {
          return new Response(JSON.stringify({ error: 'Erro ao vincular vaga ao candidato.' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        vagaId = identifyData.vaga_id
      } else {
        // Se nenhuma vaga for compatível, busca a primeira vaga aberta como fallback para pontuar ou criar analise
        const { data: fallbackVaga } = await supabase
          .from('vagas')
          .select('id')
          .order('criado_em', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (fallbackVaga?.id) {
          vagaId = fallbackVaga.id
        } else {
          return new Response(
            JSON.stringify({
              error: 'Nenhuma vaga cadastrada no sistema para realizar a análise.',
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          )
        }
      }
    }

    const analyzeRes = await fetch(`${supabaseUrl}/functions/v1/analisar-cv-criterios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseKey}` },
      body: JSON.stringify({
        cv_id: candidato.id,
        vaga_id: vagaId,
        user_id: effectiveUserId,
      }),
    })

    const analyzeData = await analyzeRes.json()

    if (analyzeData.error) {
      return new Response(JSON.stringify({ error: analyzeData.error }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: analyzeData,
        candidato: {
          id: candidato.id,
          nome: currentNome,
          email: currentEmail,
          telefone: currentTelefone,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Erro interno no servidor.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

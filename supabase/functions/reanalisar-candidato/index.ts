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
import { extractTextFromPdfBytes } from '../_shared/pdf.ts'
import { performGoogleVisionPdfOcr } from '../_shared/ocr.ts'

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

    // 1. Verificar se o nome é inválido, se faltam telefone/endereço/objetivo ou se foi forçada a reextração completa
    const validCurrentName = sanitizeAndValidateName(currentNome)
    const validExtractedName = sanitizeAndValidateName(currentDadosExtraidos.nome)
    const hasCurrentTelefone =
      Boolean(currentTelefone) ||
      Boolean(currentDadosExtraidos.telefone) ||
      (Array.isArray(currentDadosExtraidos.telefones_celulares) &&
        currentDadosExtraidos.telefones_celulares.length > 0)
    const hasCurrentEndereco = Boolean(
      currentDadosExtraidos.endereco && String(currentDadosExtraidos.endereco).trim().length > 0,
    )
    const hasObjetivo =
      typeof currentDadosExtraidos.objetivo === 'string' &&
      currentDadosExtraidos.objetivo.trim().length > 0
    const needsReExtraction =
      force_reextract ||
      !validCurrentName ||
      !validExtractedName ||
      !hasCurrentTelefone ||
      !hasCurrentEndereco ||
      !currentDadosExtraidos.skills ||
      !hasObjetivo ||
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
              : await extractTextFromPdfBytes(fileBytes)

            const openai = new OpenAI({ apiKey: openaiKey })

            let newlyExtracted: any = null

            // Tentativa 1: Via texto bruto extraído
            if (extractedText && extractedText.trim().length >= 30) {
              const systemPrompt =
                'Você é um assistente sênior de RH especialista em análise de currículos em português brasileiro. O nome do candidato frequentemente está no topo/cabeçalho do documento (ex: "VALDINÉIA DOMINGUES"). NUNCA invente dados fictícios ou use placeholders como "Candidato Desconhecido", "Nome Completo Exemplo", "João da Silva", "string ou null". Preserve rigorosamente acentos (á, é, í, ó, ú, ã, õ, ç, etc.) e grafia original. Retorne SEMPRE JSON válido.'

              const promptText = `Extraia com máxima atenção todos os dados cadastrais e profissionais do currículo:
- nome: Nome completo REAL do candidato em destaque no cabeçalho ou topo (ex: "VALDINÉIA DOMINGUES", "Valdinéia Domingues"). Preserve todos os acentos e retorne null apenas se não houver nome de pessoa física.
- email: E-mail REAL do candidato (ex: "valdineiadomingues82@gmail.com"), ou null se não identificado
- telefones_celulares: Lista de telefones celulares brasileiros REAIS com DDD (ex: ["11974697877"]) ou [] se nenhum
- telefone: Telefone principal ou null
- endereco: Endereço completo ou cidade/estado (ex: "São Bernardo do Campo - SP"), ou null se não identificado
- idade: Idade expressa em número inteiro (ex: 31, 20) ou calculada a partir da data de nascimento se informada, ou null se não constar
- data_nascimento: Data de nascimento informada (ex: "16/01/1993" ou "1993-01-16"), ou null se não constar
- objetivo: Cargo pretendido, objetivo profissional ou área informada no currículo (ex: "Cobrador de Ônibus", "Motorista", "Auxiliar Administrativo"), ou null se não identificado
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

            // Tentativa 2: Google Vision OCR caso falte cabeçalho (nome, telefone, endereco ou email)
            let parsedName = sanitizeAndValidateName(newlyExtracted?.nome)
            let hasNewTelefone =
              Boolean(newlyExtracted?.telefone) ||
              (Array.isArray(newlyExtracted?.telefones_celulares) &&
                newlyExtracted.telefones_celulares.length > 0)
            let hasNewEndereco = Boolean(
              newlyExtracted?.endereco && String(newlyExtracted.endereco).trim().length > 0,
            )
            let hasNewEmail = Boolean(newlyExtracted?.email)

            const isHeaderMissing =
              !parsedName ||
              !hasNewTelefone ||
              !hasNewEndereco ||
              !hasNewEmail ||
              !extractedText ||
              extractedText.trim().length < 30

            if (isHeaderMissing && !isDocx && fileBytes.length > 0) {
              try {
                console.log(
                  `[reanalisar-candidato] Cabeçalho ausente/incompleto para candidato ${candidato.id}. Executando Google Vision OCR...`,
                )
                const ocrText = await performGoogleVisionPdfOcr(fileBytes)
                if (ocrText && ocrText.trim().length > 20) {
                  console.log(
                    `[reanalisar-candidato] OCR obteve ${ocrText.length} caracteres. Concatenando e reextraindo com GPT-4o-mini...`,
                  )
                  const combinedText = `--- TEXTO EXTRAÍDO VIA OCR (DOCUMENT_TEXT_DETECTION) ---\n${ocrText}\n\n--- TEXTO NATIVO DO ARQUIVO ---\n${extractedText || ''}`

                  const ocrPromptText = `Extraia com máxima atenção todos os dados cadastrais (especialmente cabeçalho/contatos) e profissionais do currículo com OCR:
- nome: Nome completo REAL do candidato em destaque no cabeçalho ou topo (ex: "JOÃO BATISTA DA SILVA", "VALDINÉIA DOMINGUES"). Preserve todos os acentos e retorne null apenas se não houver nome de pessoa física.
- email: E-mail REAL do candidato (ex: "exemplo@gmail.com"), ou null se não identificado
- telefones_celulares: Lista de telefones celulares brasileiros REAIS com DDD (ex: ["11974697877", "11988887777"]) ou [] se nenhum
- telefone: Telefone principal ou null
- endereco: Endereço completo, logradouro, bairro, cidade ou estado (ex: "Rua das Flores, 123 - São Bernardo do Campo - SP"), ou null se não identificado
- idade: Idade expressa em número inteiro (ex: 31, 20) ou calculada a partir da data de nascimento se informada, ou null se não constar
- data_nascimento: Data de nascimento informada (ex: "16/01/1993" ou "1993-01-16"), ou null se não constar
- objetivo: Cargo pretendido, objetivo profissional ou área informada no currículo, ou null se não identificado
- resumo_cv: Resumo das qualificações, ou null
- experiencia_profissional: Lista de experiências anteriores, ou []
- skills: Lista de habilidades técnicas e competências, ou []
- formacao_academica: Lista de cursos e escolaridade, ou []

Texto do currículo com OCR:
${combinedText.substring(0, 25000)}`

                  const ocrResponse = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                      {
                        role: 'system',
                        content:
                          'Você é um assistente sênior de RH especialista em análise de currículos em português brasileiro. NUNCA invente dados fictícios. Preserve rigorosamente acentos (á, é, í, ó, ú, ã, õ, ç, etc.) e grafia original. Retorne SEMPRE JSON válido.',
                      },
                      { role: 'user', content: ocrPromptText },
                    ],
                    response_format: { type: 'json_object' },
                  })

                  const ocrContent = ocrResponse.choices[0]?.message?.content || '{}'
                  const ocrExtracted = JSON.parse(ocrContent)
                  if (ocrExtracted && typeof ocrExtracted === 'object') {
                    newlyExtracted = {
                      ...newlyExtracted,
                      ...ocrExtracted,
                      experiencia_profissional:
                        Array.isArray(ocrExtracted.experiencia_profissional) &&
                        ocrExtracted.experiencia_profissional.length > 0
                          ? ocrExtracted.experiencia_profissional
                          : newlyExtracted?.experiencia_profissional || [],
                      skills:
                        Array.isArray(ocrExtracted.skills) && ocrExtracted.skills.length > 0
                          ? ocrExtracted.skills
                          : newlyExtracted?.skills || [],
                      formacao_academica:
                        Array.isArray(ocrExtracted.formacao_academica) &&
                        ocrExtracted.formacao_academica.length > 0
                          ? ocrExtracted.formacao_academica
                          : newlyExtracted?.formacao_academica || [],
                    }
                    parsedName = sanitizeAndValidateName(newlyExtracted.nome) || parsedName
                    hasNewTelefone =
                      Boolean(newlyExtracted?.telefone) ||
                      (Array.isArray(newlyExtracted?.telefones_celulares) &&
                        newlyExtracted.telefones_celulares.length > 0)
                    hasNewEndereco = Boolean(
                      newlyExtracted?.endereco && String(newlyExtracted.endereco).trim().length > 0,
                    )
                    hasNewEmail = Boolean(newlyExtracted?.email)
                  }
                }
              } catch (ocrErr: any) {
                console.warn(
                  `[reanalisar-candidato] Falha no fluxo Google Vision OCR:`,
                  ocrErr?.message,
                )
              }
            }

            // Tentativa 3: Fallback de visão OpenAI existente como último recurso
            const stillNeedsVisionReextract =
              !parsedName || !hasNewTelefone || !hasNewEndereco || !hasNewEmail

            if (
              stillNeedsVisionReextract &&
              !isDocx &&
              fileBytes.length > 0 &&
              fileBytes.length < 15 * 1024 * 1024
            ) {
              try {
                console.log(
                  `[reanalisar-candidato] Tentando fallback com visão PDF (gpt-4.1) para o candidato ${candidato.id}...`,
                )
                let binaryStr = ''
                const len = fileBytes.byteLength
                for (let i = 0; i < len; i++) {
                  binaryStr += String.fromCharCode(fileBytes[i])
                }
                const base64Data = btoa(binaryStr)

                const originalFileName =
                  storagePath.split('/').pop()?.split('\\').pop() || 'curriculo.pdf'

                const visionResponse = await openai.chat.completions.create({
                  model: 'gpt-4.1',
                  messages: [
                    {
                      role: 'system',
                      content:
                        'Você é um assistente de RH de alta precisão especializado em leitura visual de currículos e PDFs. O nome completo do candidato sempre se encontra em destaque no topo/cabeçalho do currículo (ex: "VALDINÉIA DOMINGUES"). Preserve rigorosamente todos os acentos e grafia em português brasileiro (É, é, á, ã, ç, etc.). NUNCA invente dados fictícios nem use placeholders (como "Candidato Desconhecido" ou "Nome Exemplo"). Retorne SEMPRE JSON válido.',
                    },
                    {
                      role: 'user',
                      content: [
                        {
                          type: 'text',
                          text: `Analise visualmente este currículo em anexo e extraia com prioridade o nome no topo/cabeçalho (ex: "VALDINÉIA DOMINGUES" -> "Valdinéia Domingues"), idade e data de nascimento:
{
"nome": "Nome completo REAL da pessoa no cabeçalho ou null",
"email": "email real ou null",
"telefones_celulares": ["telefones REAIS com DDD"],
"endereco": "endereço ou cidade/estado ou null",
"idade": "número inteiro da idade ou null",
"data_nascimento": "data de nascimento ou null",
"objetivo": "cargo pretendido ou objetivo profissional expresso no currículo ou null",
"resumo_cv": "resumo profissional ou null",
"experiencia_profissional": ["experiências anteriores"],
"skills": ["habilidades e competências"],
"formacao_academica": ["formações e escolaridade"]
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
                const visionExtracted = JSON.parse(visionContent)
                if (visionExtracted) {
                  newlyExtracted = { ...newlyExtracted, ...visionExtracted }
                }
              } catch (visionErr: any) {
                console.error(
                  `[reanalisar-candidato] Erro na extração com visão: status=${visionErr?.status ?? 'N/A'}, mensagem=${visionErr?.message || visionErr}`,
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

    // Reanálise SEMPRE reidentifica a vaga compatível com base no currículo atualizado
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
      if (identifyData.vaga_id !== candidato.vaga_id) {
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
      }

      vagaId = identifyData.vaga_id
    } else if (!vagaId) {
      // Se nenhuma vaga for compatível e ainda não tiver vaga, busca a primeira vaga aberta ATIVA como fallback para pontuar ou criar analise
      const { data: fallbackVaga } = await supabase
        .from('vagas')
        .select('id')
        .eq('ativa', true)
        .order('criado_em', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (fallbackVaga?.id) {
        vagaId = fallbackVaga.id
      } else {
        return new Response(
          JSON.stringify({
            error: 'Nenhuma vaga ativa cadastrada no sistema para realizar a análise.',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
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

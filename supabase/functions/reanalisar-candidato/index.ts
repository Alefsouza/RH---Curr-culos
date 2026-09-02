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

            // Tentativa 3: Fallback de visão OpenAI via Files API + Responses API (gpt-4o) como último recurso
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
                  `[reanalisar-candidato] Tentando fallback de visão PDF via Files API + Responses API (gpt-4o) para candidato ${candidato.id}...`,
                )
                const originalFileName =
                  storagePath.split('/').pop()?.split('\\').pop() || 'curriculo.pdf'

                // 1. Upload do PDF via Files API usando FormData
                const formData = new FormData()
                formData.append('purpose', 'user_data')
                formData.append(
                  'file',
                  new Blob([fileBytes], { type: 'application/pdf' }),
                  originalFileName,
                )

                const fileUploadRes = await fetch('https://api.openai.com/v1/files', {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${openaiKey}`,
                  },
                  body: formData,
                })

                if (!fileUploadRes.ok) {
                  const uploadErrBody = await fileUploadRes.text()
                  console.error(
                    `[reanalisar-candidato] Falha no upload de arquivo para OpenAI Files API: status=${fileUploadRes.status}, corpo=${uploadErrBody}`,
                  )
                } else {
                  const fileData = await fileUploadRes.json()
                  const fileId = fileData?.id

                  if (!fileId) {
                    console.error(
                      `[reanalisar-candidato] OpenAI Files API retornou sucesso mas sem file.id:`,
                      JSON.stringify(fileData),
                    )
                  } else {
                    console.log(
                      `[reanalisar-candidato] Arquivo enviado para Files API com sucesso. File ID: ${fileId}`,
                    )

                    const promptText = `Você é um assistente de RH de alta precisão especializado em leitura visual e estruturação de currículos em formato PDF.
O nome completo do candidato sempre se encontra em destaque no topo/cabeçalho do currículo (ex: "VALDINÉIA DOMINGUES", "MARIA APARECIDA DA SILVA").
Preserve rigorosamente todos os acentos e grafia original em português brasileiro (á, é, í, ó, ú, ã, õ, ç, etc.).
NUNCA invente dados fictícios, nunca use "Candidato Desconhecido", "Nome Exemplo", "João da Silva" ou dados de exemplo. Se não constar com certeza, use null.
Retorne estritamente um único objeto JSON válido (sem markdown ou texto adicional fora do JSON) com a estrutura:
{
  "nome": "Nome completo REAL do candidato presente no cabeçalho/documento ou null",
  "email": "Endereço de e-mail real do candidato ou null",
  "telefones_celulares": ["telefones celulares reais encontrados com DDD"],
  "telefone": "Telefone celular principal com DDD ou null",
  "endereco": "Endereço completo, logradouro, bairro, cidade ou estado ou null",
  "idade": "Número inteiro da idade ou null",
  "data_nascimento": "Data de nascimento informada ou null",
  "objetivo": "Cargo pretendido, objetivo profissional ou área de interesse informada no currículo ou null",
  "resumo_cv": "Resumo profissional ou qualificações ou null",
  "experiencia_profissional": ["experiências anteriores com cargo e empresa"],
  "skills": ["habilidades e competências identificadas"],
  "formacao_academica": ["formações, cursos e escolaridade"]
}`

                    const responseApiRes = await fetch('https://api.openai.com/v1/responses', {
                      method: 'POST',
                      headers: {
                        Authorization: `Bearer ${openaiKey}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        model: 'gpt-4o',
                        input: [
                          {
                            role: 'user',
                            content: [
                              {
                                type: 'input_file',
                                file_id: fileId,
                              },
                              {
                                type: 'input_text',
                                text: promptText,
                              },
                            ],
                          },
                        ],
                      }),
                    })

                    if (!responseApiRes.ok) {
                      const errBody = await responseApiRes.text()
                      console.error(
                        `[reanalisar-candidato] Falha na chamada OpenAI Responses API: status=${responseApiRes.status}, corpo=${errBody}`,
                      )
                    } else {
                      const resData = await responseApiRes.json()
                      let rawText = ''
                      if (
                        typeof resData?.output_text === 'string' &&
                        resData.output_text.trim().length > 0
                      ) {
                        rawText = resData.output_text
                      } else if (Array.isArray(resData?.output)) {
                        for (const outItem of resData.output) {
                          if (Array.isArray(outItem?.content)) {
                            for (const cnt of outItem.content) {
                              if (cnt?.type === 'output_text' && typeof cnt.text === 'string') {
                                rawText += cnt.text
                              } else if (typeof cnt?.text === 'string') {
                                rawText += cnt.text
                              }
                            }
                          }
                        }
                      }

                      if (rawText) {
                        let visionExtracted: any = null
                        try {
                          visionExtracted = JSON.parse(rawText)
                        } catch {
                          const firstBrace = rawText.indexOf('{')
                          const lastBrace = rawText.lastIndexOf('}')
                          if (firstBrace !== -1 && lastBrace > firstBrace) {
                            try {
                              visionExtracted = JSON.parse(
                                rawText.substring(firstBrace, lastBrace + 1),
                              )
                            } catch (parseErr: any) {
                              console.error(
                                `[reanalisar-candidato] Erro ao fazer parse do JSON da Responses API:`,
                                parseErr?.message,
                                `Texto:`,
                                rawText,
                              )
                            }
                          }
                        }

                        if (visionExtracted && typeof visionExtracted === 'object') {
                          newlyExtracted = {
                            ...newlyExtracted,
                            ...visionExtracted,
                            experiencia_profissional:
                              Array.isArray(visionExtracted.experiencia_profissional) &&
                              visionExtracted.experiencia_profissional.length > 0
                                ? visionExtracted.experiencia_profissional
                                : newlyExtracted?.experiencia_profissional || [],
                            skills:
                              Array.isArray(visionExtracted.skills) &&
                              visionExtracted.skills.length > 0
                                ? visionExtracted.skills
                                : newlyExtracted?.skills || [],
                            formacao_academica:
                              Array.isArray(visionExtracted.formacao_academica) &&
                              visionExtracted.formacao_academica.length > 0
                                ? visionExtracted.formacao_academica
                                : newlyExtracted?.formacao_academica || [],
                          }
                          console.log(
                            `[reanalisar-candidato] Sucesso no fallback Responses API: nome=${visionExtracted.nome || 'N/A'}, email=${visionExtracted.email || 'N/A'}`,
                          )
                        }
                      } else {
                        console.warn(
                          `[reanalisar-candidato] Responses API retornou sem output_text. Resposta completa:`,
                          JSON.stringify(resData),
                        )
                      }
                    }
                  }
                }
              } catch (visionErr: any) {
                console.error(
                  `[reanalisar-candidato] Erro na extração com visão Responses API: status=${visionErr?.status ?? 'N/A'}, mensagem=${visionErr?.message || visionErr}`,
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

    const identifiedVagaId = identifyData.vaga_id || null
    const justificativaIdentificacao =
      identifyData.justificativa || 'Nenhuma vaga compatível foi identificada no sistema.'

    // =========================================================================
    // CASO 1: NENHUMA VAGA COMPATÍVEL IDENTIFICADA (vaga_id = null)
    // =========================================================================
    if (!identifiedVagaId) {
      console.log(
        `[reanalisar-candidato] Nenhuma vaga compatível para candidato ${candidato.id}. Limpando vaga_id e etapa_id, e registrando nao_qualificado.`,
      )

      // 1. Limpa vaga_id e etapa_id do candidato para que ele não apareça no Kanban como qualificado
      await supabase
        .from('candidatos')
        .update({
          vaga_id: null,
          etapa_id: null,
        })
        .eq('id', candidato.id)

      // 2. Registra análise com resultado "nao_qualificado" e vaga_id null
      const motivoSemVaga =
        hasObjetivo && currentDadosExtraidos.objetivo
          ? `Não há vaga compatível para o cargo "${currentDadosExtraidos.objetivo}". ${justificativaIdentificacao}`
          : `Não há vaga compatível com o perfil profissional do candidato no momento. ${justificativaIdentificacao}`

      const analiseSemVagaPayload = {
        candidato_id: candidato.id,
        vaga_id: null,
        resultado: 'nao_qualificado',
        detalhes: {
          motivo: motivoSemVaga,
          summary: motivoSemVaga,
          justificativa: justificativaIdentificacao,
          confianca: identifyData.confianca || 'nenhuma',
          score: 0,
          matched_criteria: [],
          unmatched_criteria: [
            {
              nome: 'Vaga compatível',
              motivo: motivoSemVaga,
            },
          ],
        },
        user_id: effectiveUserId || candidato.user_id,
      }

      const { data: existingNullAnalise } = await supabase
        .from('analises')
        .select('id')
        .eq('candidato_id', candidato.id)
        .is('vaga_id', null)
        .maybeSingle()

      let savedAnaliseData: any = null
      if (existingNullAnalise) {
        const { data: updAnalise } = await supabase
          .from('analises')
          .update({
            resultado: 'nao_qualificado',
            detalhes: analiseSemVagaPayload.detalhes,
          })
          .eq('id', existingNullAnalise.id)
          .select()
          .single()
        savedAnaliseData = updAnalise
      } else {
        const { data: insAnalise } = await supabase
          .from('analises')
          .insert(analiseSemVagaPayload)
          .select()
          .single()
        savedAnaliseData = insAnalise
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            success: true,
            analise: savedAnaliseData,
          },
          candidato: {
            id: candidato.id,
            nome: currentNome,
            email: currentEmail,
            telefone: currentTelefone,
            vaga_id: null,
          },
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // =========================================================================
    // CASO 2: VAGA COMPATÍVEL IDENTIFICADA (vaga_id presente)
    // =========================================================================
    if (identifiedVagaId !== candidato.vaga_id) {
      const { error: updateError } = await supabase
        .from('candidatos')
        .update({ vaga_id: identifiedVagaId })
        .eq('id', candidato.id)

      if (updateError) {
        return new Response(JSON.stringify({ error: 'Erro ao vincular vaga ao candidato.' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    const analyzeRes = await fetch(`${supabaseUrl}/functions/v1/analisar-cv-criterios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseKey}` },
      body: JSON.stringify({
        cv_id: candidato.id,
        vaga_id: identifiedVagaId,
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
          vaga_id: identifiedVagaId,
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

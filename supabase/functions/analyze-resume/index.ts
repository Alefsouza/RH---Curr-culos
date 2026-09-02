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

// Extrai e limpa nome a partir do nome do arquivo (ex: "curriculo_joao_silva.pdf" -> "Joao Silva")
function extractNameFromFileName(filePath: string): string | null {
  if (!filePath) return null
  const baseName = filePath.split('/').pop()?.split('\\').pop() || filePath
  // Remove extensão
  const nameWithoutExt = baseName.replace(/\.[^/.]+$/, '')
  // Remove prefixos e sufixos de timestamp, hashes ou identificadores tipo 1788205749600-87afhn ou 1788206596330-1h6kms ou tvw8ns
  let cleaned = nameWithoutExt
    .replace(/^\d+[-_]?/, '') // remove timestamp no início
    .replace(/[-_]\d+$/, '') // remove timestamp no fim
    .replace(/[-_][a-z0-9]{4,12}$/i, '') // remove hash curta no fim
    .replace(/[._-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Se o nome resultante contiver QUALQUER dígito ou for apenas números/hash/termos genéricos
  if (/\d/.test(cleaned)) {
    return null
  }

  // Rejeita padrões tipo hash ou identificador alfanumérico curto
  if (/^[a-z0-9]{3,12}$/i.test(cleaned.replace(/\s+/g, ''))) {
    return null
  }

  if (
    /^(curriculo|curriculos|cv|resume|documento|doc|scan|arquivo|upload|temp|file|\d+)$/i.test(
      cleaned,
    )
  ) {
    return null
  }

  // Remove termos como "curriculo de", "cv -", etc.
  cleaned = cleaned.replace(/^(curr[ií]culo|cv|resume)(\s+de)?\s+/i, '').trim()

  if (/\d/.test(cleaned)) {
    return null
  }

  if (/^[a-z0-9]{3,12}$/i.test(cleaned.replace(/\s+/g, ''))) {
    return null
  }

  if (cleaned.length >= 3 && /[a-zA-ZÀ-ÿ]/.test(cleaned)) {
    const formatted = cleaned.replace(/\b\w/g, (l) => l.toUpperCase())
    return sanitizeAndValidateName(formatted)
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

  // Substitui pontos, underscores, traços, números no final
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
      extractedText = await extractRawTextFromDocxBytes(fileBytes)
    } else {
      extractedText = await extractTextFromPdfBytes(fileBytes)
    }

    const hasSufficientText = extractedText && extractedText.trim().length >= 40

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

    let extractedData: any = {
      nome: null,
      email: null,
      telefones_celulares: [],
      telefone: null,
      endereco: null,
      idade: null,
      data_nascimento: null,
      objetivo: null,
      experiencia_profissional: [],
      skills: [],
      formacao_academica: [],
    }

    if (hasSufficientText) {
      const extractionPrompt = `Analise o texto do currículo e extraia com máxima precisão:
- nome: Nome completo REAL do candidato em destaque no cabeçalho ou topo (ex: "VALDINÉIA DOMINGUES", "Valdinéia Domingues", "Carlos Eduardo"). Preserve rigorosamente todos os acentos (á, é, í, ó, ú, ã, õ, ç, etc.). Retorne null apenas se for impossível identificar um nome de pessoa física.
- email: Endereço de e-mail REAL válido (ex: "valdineiadomingues82@gmail.com"), ou null se não identificado
- telefones_celulares: Lista de telefones celulares brasileiros REAIS com DDD (ex: ["11974697877"]) ou [] se nenhum
- telefone: Telefone celular principal ou null
- endereco: Cidade, estado ou endereço completo (ex: "São Bernardo do Campo - SP"), ou null se não identificado
- idade: Idade expressa em número inteiro (ex: 31, 20) ou calculada a partir da data de nascimento se informada, ou null se não constar
- data_nascimento: Data de nascimento informada (ex: "16/01/1993" ou "1993-01-16"), ou null se não constar
- objetivo: Cargo pretendido, objetivo profissional ou área de interesse expressamente informada no currículo (ex: "Cobrador de Ônibus", "Motorista", "Auxiliar Administrativo", "Mecânico"), ou null se não identificado
- experiencia_profissional: Lista de experiências anteriores com cargos e empresas, ou []
- skills: Lista de habilidades técnicas e competências, ou []
- formacao_academica: Lista de cursos, formações, escolaridade, certificações e credenciais (ex: "Credencial de Transporte Coletivo", "Curso de Transporte Coletivo de Passageiros"), ou []

IMPORTANTE:
1. NUNCA invente dados fictícios nem use "Candidato Desconhecido", "João da Silva", emails de exemplo ou telefones falsos.
2. O nome do candidato frequentemente aparece no início do texto (cabeçalho). Se encontrar um nome como "VALDINÉIA DOMINGUES", extraia com precisão.
3. Capture a idade ou data de nascimento com rigor se presente no documento.
4. Capture o "objetivo" ou cargo pretendido com máxima atenção, pois ele é fundamental para associar a vaga correta.
5. NUNCA retorne a string literal "string ou null" ou "string". Use null real quando não constar.

Formato JSON estrito esperado:
{
  "nome": null,
  "email": null,
  "telefones_celulares": [],
  "telefone": null,
  "endereco": null,
  "idade": null,
  "data_nascimento": null,
  "objetivo": null,
  "experiencia_profissional": [],
  "skills": [],
  "formacao_academica": []
}

Texto extraído do currículo:
${extractedText.substring(0, 20000)}`

      try {
        extractedData = await callOpenAIWithRetry(extractionPrompt)
      } catch (err: any) {
        console.warn('Falha na chamada OpenAI padrão:', err?.message)
      }
    }

    // Verificar se dados do cabeçalho estão ausentes/vazios (nome, telefone, endereco ou email)
    let cleanName = sanitizeAndValidateName(extractedData?.nome || nome)
    const isDocx = filePath.toLowerCase().endsWith('.docx')

    let hasTelefone =
      Boolean(extractedData?.telefone) ||
      (Array.isArray(extractedData?.telefones_celulares) &&
        extractedData.telefones_celulares.length > 0) ||
      Boolean(telefone)
    let hasEndereco = Boolean(
      extractedData?.endereco && String(extractedData.endereco).trim().length > 0,
    )
    let hasEmail = Boolean(extractedData?.email || email)

    const isHeaderIncomplete =
      !cleanName || !hasTelefone || !hasEndereco || !hasEmail || !hasSufficientText

    // 3.1 OCR via Google Cloud Vision como principal recurso quando falta cabeçalho
    if (isHeaderIncomplete && !isDocx && fileBytes.length > 0) {
      try {
        console.log(
          `[analyze-resume] Cabeçalho incompleto ou ausente. Executando Google Vision OCR para ${filePath}...`,
        )
        const ocrText = await performGoogleVisionPdfOcr(fileBytes)
        if (ocrText && ocrText.trim().length > 20) {
          console.log(
            `[analyze-resume] OCR obteve ${ocrText.length} caracteres. Concatenando com texto existente e reextraindo...`,
          )
          // O texto do OCR é ADICIONADO ao texto já extraído (não substitui)
          const combinedText = `--- TEXTO EXTRAÍDO VIA OCR (DOCUMENT_TEXT_DETECTION) ---\n${ocrText}\n\n--- TEXTO NATIVO DO ARQUIVO ---\n${extractedText || ''}`

          const reextractionPrompt = `Analise o texto completo do currículo (incluindo leitura de OCR de cabeçalho) e extraia com máxima precisão:
- nome: Nome completo REAL do candidato em destaque no cabeçalho ou topo (ex: "JOÃO BATISTA DA SILVA", "VALDINÉIA DOMINGUES"). Preserve rigorosamente todos os acentos (á, é, í, ó, ú, ã, õ, ç, etc.). Retorne null apenas se for impossível identificar um nome de pessoa física.
- email: Endereço de e-mail REAL válido (ex: "exemplo@gmail.com"), ou null se não identificado
- telefones_celulares: Lista de telefones celulares brasileiros REAIS com DDD (ex: ["11974697877", "11988887777"]) ou [] se nenhum
- telefone: Telefone celular principal ou null
- endereco: Endereço completo, logradouro, bairro, cidade ou estado (ex: "Rua das Flores, 123 - São Bernardo do Campo - SP"), ou null se não identificado
- idade: Idade expressa em número inteiro (ex: 31, 20) ou calculada a partir da data de nascimento se informada, ou null se não constar
- data_nascimento: Data de nascimento informada (ex: "16/01/1993" ou "1993-01-16"), ou null se não constar
- objetivo: Cargo pretendido, objetivo profissional ou área informada no currículo, ou null se não identificado
- experiencia_profissional: Lista de experiências anteriores com cargos e empresas, ou []
- skills: Lista de habilidades técnicas e competências, ou []
- formacao_academica: Lista de cursos e formações, ou []

Texto do currículo com OCR:
${combinedText.substring(0, 25000)}`

          const reExtracted = await callOpenAIWithRetry(reextractionPrompt)
          if (reExtracted && typeof reExtracted === 'object') {
            extractedData = {
              ...extractedData,
              ...reExtracted,
              // Preserva arrays não vazios anteriores se a reextração vier vazia
              experiencia_profissional:
                Array.isArray(reExtracted.experiencia_profissional) &&
                reExtracted.experiencia_profissional.length > 0
                  ? reExtracted.experiencia_profissional
                  : extractedData.experiencia_profissional,
              skills:
                Array.isArray(reExtracted.skills) && reExtracted.skills.length > 0
                  ? reExtracted.skills
                  : extractedData.skills,
              formacao_academica:
                Array.isArray(reExtracted.formacao_academica) &&
                reExtracted.formacao_academica.length > 0
                  ? reExtracted.formacao_academica
                  : extractedData.formacao_academica,
            }

            cleanName = sanitizeAndValidateName(extractedData.nome) || cleanName
            hasTelefone =
              Boolean(extractedData?.telefone) ||
              (Array.isArray(extractedData?.telefones_celulares) &&
                extractedData.telefones_celulares.length > 0) ||
              Boolean(telefone)
            hasEndereco = Boolean(
              extractedData?.endereco && String(extractedData.endereco).trim().length > 0,
            )
            hasEmail = Boolean(extractedData?.email || email)
          }
        }
      } catch (ocrErr: any) {
        console.warn(`[analyze-resume] Falha no fluxo de OCR Google Vision:`, ocrErr?.message)
      }
    }

    // 3.2 Fallback de visão OpenAI via Files API + Responses API (gpt-4o) como último recurso (se ainda faltar dados e for PDF < 15MB)
    const stillNeedsVision =
      !cleanName ||
      !hasTelefone ||
      !hasEndereco ||
      (!hasEmail && (!extractedData?.skills || extractedData.skills.length === 0))

    if (
      stillNeedsVision &&
      !isDocx &&
      fileBytes.length > 0 &&
      fileBytes.length < 15 * 1024 * 1024
    ) {
      try {
        console.log(
          `[analyze-resume] Tentando fallback de visão PDF via Files API + Responses API (gpt-4o) para ${filePath}...`,
        )
        const originalFileName = filePath.split('/').pop()?.split('\\').pop() || 'curriculo.pdf'

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
            `[analyze-resume] Falha no upload de arquivo para OpenAI Files API: status=${fileUploadRes.status}, corpo=${uploadErrBody}`,
          )
        } else {
          const fileData = await fileUploadRes.json()
          const fileId = fileData?.id

          if (!fileId) {
            console.error(
              `[analyze-resume] OpenAI Files API retornou sucesso mas sem file.id:`,
              JSON.stringify(fileData),
            )
          } else {
            console.log(
              `[analyze-resume] Arquivo enviado para Files API com sucesso. File ID: ${fileId}`,
            )

            const promptText = `Você é um assistente sênior de RH altamente especializado em leitura visual e estruturação de currículos em formato PDF.
O nome completo do candidato sempre se encontra em destaque no cabeçalho ou topo do currículo (ex: "VALDINÉIA DOMINGUES", "MARIA APARECIDA DA SILVA").
Preserve rigorosamente todos os acentos e grafia original em português brasileiro (á, é, í, ó, ú, ã, õ, ç, etc.).
NUNCA invente dados fictícios, nunca use "Candidato Desconhecido", "João da Silva" ou dados de exemplo. Se não constar com certeza, use null.
Retorne estritamente um único objeto JSON válido (sem markdown ou texto adicional fora do JSON) com a estrutura:
{
  "nome": "Nome completo REAL do candidato em destaque no cabeçalho ou null",
  "email": "Endereço de e-mail real do candidato ou null",
  "telefones_celulares": ["telefones celulares reais encontrados com DDD"],
  "telefone": "Telefone principal com DDD ou null",
  "endereco": "Endereço completo, logradouro, bairro, cidade ou estado ou null",
  "idade": "Número inteiro da idade ou null",
  "data_nascimento": "Data de nascimento informada ou null",
  "objetivo": "Cargo pretendido, objetivo profissional ou área de interesse informada no currículo ou null",
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
                `[analyze-resume] Falha na chamada OpenAI Responses API: status=${responseApiRes.status}, corpo=${errBody}`,
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
                let visionData: any = null
                try {
                  visionData = JSON.parse(rawText)
                } catch {
                  const firstBrace = rawText.indexOf('{')
                  const lastBrace = rawText.lastIndexOf('}')
                  if (firstBrace !== -1 && lastBrace > firstBrace) {
                    try {
                      visionData = JSON.parse(rawText.substring(firstBrace, lastBrace + 1))
                    } catch (parseErr: any) {
                      console.error(
                        `[analyze-resume] Erro ao fazer parse do JSON da Responses API:`,
                        parseErr?.message,
                        `Texto:`,
                        rawText,
                      )
                    }
                  }
                }

                if (visionData && typeof visionData === 'object') {
                  extractedData = {
                    ...extractedData,
                    ...visionData,
                    ...(visionData.nome ? { nome: visionData.nome } : {}),
                    ...(visionData.email ? { email: visionData.email } : {}),
                    experiencia_profissional:
                      Array.isArray(visionData.experiencia_profissional) &&
                      visionData.experiencia_profissional.length > 0
                        ? visionData.experiencia_profissional
                        : extractedData.experiencia_profissional,
                    skills:
                      Array.isArray(visionData.skills) && visionData.skills.length > 0
                        ? visionData.skills
                        : extractedData.skills,
                    formacao_academica:
                      Array.isArray(visionData.formacao_academica) &&
                      visionData.formacao_academica.length > 0
                        ? visionData.formacao_academica
                        : extractedData.formacao_academica,
                  }
                  cleanName = sanitizeAndValidateName(visionData.nome) || cleanName
                  console.log(
                    `[analyze-resume] Sucesso no fallback Responses API: nome=${visionData.nome || 'N/A'}, email=${visionData.email || 'N/A'}`,
                  )
                }
              } else {
                console.warn(
                  `[analyze-resume] Responses API retornou sem output_text. Resposta completa:`,
                  JSON.stringify(resData),
                )
              }
            }
          }
        }
      } catch (visionErr: any) {
        console.error(
          `[analyze-resume] Leitura visual do PDF não pôde processar: status=${visionErr?.status ?? 'N/A'}, mensagem=${visionErr?.message || visionErr}`,
        )
      }
    }

    // Extração e validação do e-mail
    const cleanEmail = sanitizeAndValidateEmail(extractedData?.email || email)

    // Estratégia de Fallback em cascata para NUNCA retornar 400 por falta de nome:
    // 1. Nome validado pela IA (texto ou visão) ou fornecido no body
    // 2. Extração pelo prefixo do e-mail (ex: "maria.souza@..." -> "Maria Souza")
    // 3. Extração pelo nome do arquivo (ex: "cv_marcos_silva.pdf" -> "Marcos Silva")
    // 4. Fallback padrão "Candidato"
    let finalNome = cleanName

    if (!finalNome) {
      const emailDerivedName = extractNameFromEmail(cleanEmail)
      const validEmailDerived = sanitizeAndValidateName(emailDerivedName)
      if (validEmailDerived) {
        finalNome = validEmailDerived
      }
    }

    if (!finalNome) {
      const fileDerivedName = extractNameFromFileName(filePath)
      const validFileDerived = sanitizeAndValidateName(fileDerivedName)
      if (validFileDerived) {
        finalNome = validFileDerived
      }
    }

    if (!finalNome) {
      finalNome = 'Candidato'
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

    const finalEmail = cleanEmail

    // Deduplicação (apenas se tiver e-mail ou telefone válido)
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
            texto_cv: extractedText || '',
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
        candidato_nome: finalNome,
        dados_extraidos: {
          ...extractedData,
          nome: finalNome,
          email: finalEmail,
          telefone: finalTelefone,
        },
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

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'
import { corsHeaders } from '../_shared/cors.ts'
import {
  normalizePhone,
  isValidBrazilianPhone,
  sanitizeAndValidateName,
  sanitizeAndValidateEmail,
  resolveCandidateAge,
} from '../_shared/validation.ts'
import { extractRawTextFromDocxBytes } from '../_shared/docx.ts'
import { extractTextFromPdfBytes } from '../_shared/pdf.ts'
import { performGoogleVisionPdfOcrDetailed } from '../_shared/ocr.ts'
import { extractCep } from '../_shared/proximity.ts'
import { mergeExtractedCnh } from '../_shared/cnh.ts'

// Reanálise de candidato com regras de fallback por experiência e salvaguarda
// Deploy e execução da correção do falso motorista (Henrique Amâncio)
// Versão v0.0.648 - verificação ativa de boot
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
    const { candidate_id, force_reextract, target_vaga_id, target_etapa } = body

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
    const validCurrentName = sanitizeAndValidateName(candidato.nome)
    let currentDadosExtraidos =
      typeof candidato.dados_extraidos === 'object' && candidato.dados_extraidos !== null
        ? { ...candidato.dados_extraidos }
        : {}

    // Garantir que a idade seja derivada da data de nascimento se ela existir
    const initialResolvedAge = resolveCandidateAge(
      currentDadosExtraidos.idade,
      currentDadosExtraidos.data_nascimento,
    )
    if (initialResolvedAge !== null && currentDadosExtraidos.idade !== initialResolvedAge) {
      currentDadosExtraidos.idade = initialResolvedAge
      await supabase
        .from('candidatos')
        .update({ dados_extraidos: currentDadosExtraidos })
        .eq('id', candidato.id)
    }

    // Só acionar reextração pesada de PDF (OCR/OpenAI Files) se force_reextract === true
    // OU se dados_extraidos do candidato for nulo/vazio. A ausência de e-mail (email: null)
    // NÃO deve disparar reextração quando os dados extraídos já existem.
    const isDadosExtraidosEmpty =
      !candidato.dados_extraidos ||
      (typeof candidato.dados_extraidos === 'object' &&
        Object.keys(candidato.dados_extraidos).length === 0)

    const needsReExtraction = Boolean(force_reextract || isDadosExtraidosEmpty)

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
            let parsedName: string | null = sanitizeAndValidateName(candidato.nome)
            if (parsedName && parsedName.toLowerCase() === 'candidato') {
              parsedName = null
            }

            // Tentativa 1: Via texto bruto extraído
            if (extractedText && extractedText.trim().length >= 30) {
              const systemPrompt =
                'Você é um assistente sênior de RH especialista em análise de currículos em português brasileiro. O nome do candidato frequentemente está no topo/cabeçalho do documento (ex: "VALDINÉIA DOMINGUES"). NUNCA invente dados fictícios ou use placeholders como "Candidato Desconhecido", "Nome Completo Exemplo", "João da Silva", "string ou null". Preserve rigorosamente acentos (á, é, í, ó, ú, ã, õ, ç, etc.) e grafia original. Retorne SEMPRE JSON válido.'

              const promptText = `Extraia com máxima atenção todos os dados cadastrais e profissionais do currículo:
- nome: Nome completo REAL do candidato em destaque no cabeçalho ou topo (ex: "VALDINÉIA DOMINGUES", "Valdinéia Domingues"). Preserve todos os acentos e retorne null apenas se não houver nome de pessoa física.
- email: E-mail REAL do candidato (ex: "valdineiadomingues82@gmail.com"), ou null se não identificado
- telefones_celulares: Lista de telefones celulares brasileiros REAIS com DDD (ex: ["11974697877"]) ou [] se nenhum. ATENÇÃO: capture celulares mesmo com o 9º dígito separado por espaço ou traço (ex: "(11) 9 5386-9329", "11 9 5386-9329"), normalizando SEMPRE para 11 dígitos com o 9 inicial (ex: "11953869329"), NUNCA descartando o 9 isolado.
- telefone: Telefone celular principal normalizado com DDD (11 dígitos, ex: "11953869329") ou null
- endereco: Endereço completo COMPLETO com logradouro, número, complemento, bairro, cidade, UF e CEP se existirem no documento (ex: "R. Timóteo, 88 - Jardim Paraguaçu, São Paulo - SP, 03938-050"). NUNCA trunque para apenas "Jardim - SP" ou apenas o bairro se houver rua, número, cidade ou CEP no currículo.
- cep: Código de Endereçamento Postal (ex: "03938-050"), ou null se não constar no documento
- idade: Idade expressa em número inteiro (ex: 31, 20) ou calculada a partir da data de nascimento se informada, ou null se não constar
- data_nascimento: Data de nascimento informada em qualquer formato (ex: "16/01/1993", "16-01-1993", "16.01.1993", "1993-01-16", "nascido em 16 de janeiro de 1993"), ou null se não constar
- cnh: Informação sobre CNH / Carteira de Habilitação identificada (ex: "Categoria D", "CNH D", "Categoria AB", "Categoria E", "Possui CNH D"), ou null se não informada
- cnh_categoria: Categoria exata da CNH (ex: "D", "E", "AB", "AD", "AE", "B", "A"), ou null se não informada
- objetivo: Cargo pretendido, objetivo profissional ou área informada no currículo (ex: "Cobrador de Ônibus", "Motorista", "Auxiliar Administrativo"), ou null se não identificado
- resumo_cv: Resumo das qualificações, ou null
- experiencia_profissional: Lista de experiências profissionais com cargo, empresa, período/datas (início e término, ex: "02/2023 – atual", "01/2020 – 12/2022") e se o vínculo é atual/ativo, ou []
- skills: Lista de habilidades técnicas e competências, ou []
- formacao_academica: Lista de cursos, escolaridade, certificações e credenciais (ex: "Credencial de Transporte Coletivo", "Curso de Transporte Coletivo de Passageiros", "Curso MOPP"), ou []

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

            // Tentativa 2: Google Vision OCR caso falte cabeçalho (nome, telefone, endereco ou email) OU corpo esteja vazio
            parsedName = sanitizeAndValidateName(newlyExtracted?.nome)
            let hasNewTelefone =
              Boolean(newlyExtracted?.telefone) ||
              (Array.isArray(newlyExtracted?.telefones_celulares) &&
                newlyExtracted.telefones_celulares.length > 0)
            let hasNewEndereco = Boolean(
              newlyExtracted?.endereco && String(newlyExtracted.endereco).trim().length > 0,
            )
            let hasNewEmail = Boolean(newlyExtracted?.email)

            const hasDataNascimento = Boolean(
              newlyExtracted?.data_nascimento &&
              String(newlyExtracted.data_nascimento).trim().length > 0,
            )

            const isHeaderMissing =
              !parsedName ||
              parsedName.toLowerCase() === 'candidato' ||
              !hasNewTelefone ||
              !hasNewEndereco ||
              !hasNewEmail ||
              !extractedText ||
              extractedText.trim().length < 50

            const hasNewlyExtractedExperiencia =
              Array.isArray(newlyExtracted?.experiencia_profissional) &&
              newlyExtracted.experiencia_profissional.length > 0
            const hasNewlyExtractedFormacao =
              Array.isArray(newlyExtracted?.formacao_academica) &&
              newlyExtracted.formacao_academica.length > 0
            const hasNewlyExtractedSkills =
              Array.isArray(newlyExtracted?.skills) && newlyExtracted.skills.length > 0
            const hasNewlyExtractedObjetivo =
              typeof newlyExtracted?.objetivo === 'string' &&
              newlyExtracted.objetivo.trim().length > 0

            // O corpo é considerado vazio se todas as 4 chaves estiverem vazias/null
            const isNewlyExtractedBodyEmpty =
              !hasNewlyExtractedExperiencia &&
              !hasNewlyExtractedFormacao &&
              !hasNewlyExtractedSkills &&
              !hasNewlyExtractedObjetivo

            const shouldTriggerOcr = isHeaderMissing || isNewlyExtractedBodyEmpty

            let visionOcrError: any = null
            let ocrCapturedText: string | null = null

            console.log(
              `[reanalisar-candidato] DEBUG OCR: parsedName='${parsedName}', isHeaderMissing=${isHeaderMissing}, shouldTriggerOcr=${shouldTriggerOcr}, isDocx=${isDocx}, bytes=${fileBytes.length}`,
            )

            if (shouldTriggerOcr && !isDocx && fileBytes.length > 0) {
              try {
                console.log(
                  `[reanalisar-candidato] Disparo de Google Vision OCR para candidato ${candidato.id}: ${
                    isHeaderMissing
                      ? 'cabeçalho incompleto'
                      : 'corpo vazio (experiência, formação, skills e objetivo vazios)'
                  }.`,
                )
                const ocrDetail = await performGoogleVisionPdfOcrDetailed(fileBytes)
                const ocrText = ocrDetail.text
                ocrCapturedText = ocrText
                if (!ocrDetail.success && ocrDetail.error) {
                  visionOcrError = ocrDetail.error
                  console.error(
                    `[reanalisar-candidato] Falha explícita no Google Vision OCR:`,
                    ocrDetail.error,
                  )
                }
                if (ocrText && ocrText.trim().length > 20) {
                  console.log(
                    `[reanalisar-candidato] OCR obteve ${ocrText.length} caracteres. Concatenando e reextraindo com GPT-4o-mini...`,
                  )
                  const combinedText = `--- TEXTO EXTRAÍDO VIA OCR (DOCUMENT_TEXT_DETECTION) ---\n${ocrText}\n\n--- TEXTO NATIVO DO ARQUIVO ---\n${extractedText || ''}`

                  const ocrPromptText = `Extraia com máxima atenção todos os dados cadastrais (especialmente cabeçalho/contatos, nome em imagem de topo, Canva ou layout estilizado) e profissionais do currículo com OCR:
    - nome: Nome completo REAL da pessoa física em destaque no cabeçalho, topo ou faixa colorida superior (ex: "JOÃO BATISTA DA SILVA", "VALDINÉIA DOMINGUES"). Em currículos do Canva ou editores gráficos, o nome frequentemente aparece nas primeiras linhas do OCR como título principal. Preserve todos os acentos e retorne null apenas se absolutamente não houver nome de pessoa física. NUNCA retorne "Candidato" ou nome genérico.- email: E-mail REAL do candidato (ex: "exemplo@gmail.com"), ou null se não identificado
- telefones_celulares: Lista de telefones celulares brasileiros REAIS com DDD (ex: ["11974697877", "11988887777"]) ou [] se nenhum. ATENÇÃO: capture celulares mesmo com o 9º dígito separado por espaço ou traço (ex: "(11) 9 5386-9329"), normalizando SEMPRE para 11 dígitos com o 9 inicial (ex: "11953869329"), NUNCA descartando o 9 isolado.
- telefone: Telefone celular principal normalizado com DDD (11 dígitos, ex: "11953869329") ou null
- endereco: Endereço completo COMPLETO com logradouro, número, complemento, bairro, cidade, UF e CEP se existirem no documento (ex: "R. Timóteo, 88 - Jardim Paraguaçu, São Paulo - SP, 03938-050"). NUNCA trunque para apenas "Jardim - SP" ou apenas o bairro se houver rua, número, cidade ou CEP no currículo.
- cep: CEP brasileiro completo (ex: "03938-050"), ou null se não constar
- idade: Idade expressa em número inteiro (ex: 31, 20) ou calculada a partir da data de nascimento se informada, ou null se não constar
- data_nascimento: Data de nascimento informada (ex: "16/01/1993" ou "1993-01-16"), ou null se não constar
- cnh: Informação sobre CNH / Habilitação (ex: "Categoria D", "CNH D", "Categoria AB"), ou null se não informada
- cnh_categoria: Categoria exata da CNH (ex: "D", "E", "AB", "AD", "AE"), ou null se não informada
- objetivo: Cargo pretendido, objetivo profissional ou área informada no currículo, ou null se não identificado
- resumo_cv: Resumo das qualificações, ou null
- experiencia_profissional: Lista de experiências profissionais com cargo, empresa, período/datas (início e término, ex: "02/2023 – atual", "01/2020 – 12/2022") e se o vínculo é atual/ativo, ou []
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
                visionOcrError = { message: ocrErr?.message || String(ocrErr) }
                console.warn(
                  `[reanalisar-candidato] Falha no fluxo Google Vision OCR:`,
                  ocrErr?.message,
                )
              }
            }

            // Salvaguarda: se mesmo após OCR geral o nome ainda não foi identificado no PDF, forçar chamada dedicada focada no cabeçalho
            if (!parsedName && !isDocx && fileBytes.length > 0) {
              try {
                let ocrText = ocrCapturedText
                if (!ocrText) {
                  const ocrDetail = await performGoogleVisionPdfOcrDetailed(fileBytes)
                  ocrText = ocrDetail.text
                  ocrCapturedText = ocrText
                }
                if (ocrText && ocrText.trim().length > 20) {
                  const headerPrompt = `Identifique exclusivamente o NOME COMPLETO REAL da pessoa física deste currículo a partir do texto lido via OCR (Google Vision).
Em currículos do Canva ou editores visuais, o nome da pessoa fica no topo superior, na primeira linha ou no cabeçalho, mesmo que isolado.
Seja meticuloso: analise as primeiras 20 linhas do texto OCR e extraia o nome completo da pessoa dona do currículo.
Retorne um JSON estrito: {"nome": "Nome Completo" ou null, "email": "email" ou null, "telefone": "telefone" ou null, "cnh": "cnh" ou null, "idade": número ou null}

Texto OCR:
${ocrText.substring(0, 15000)}`
                  const ocrHeaderResp = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                      {
                        role: 'system',
                        content:
                          'Você é um assistente de RH de altíssima precisão. O nome do candidato frequentemente está nas primeiras linhas do texto OCR. NUNCA invente dados e preserve todos os acentos originais.',
                      },
                      { role: 'user', content: headerPrompt },
                    ],
                    response_format: { type: 'json_object' },
                  })
                  const headerObj = JSON.parse(ocrHeaderResp.choices[0]?.message?.content || '{}')
                  if (headerObj?.nome) {
                    const validHeaderName = sanitizeAndValidateName(headerObj.nome)
                    if (validHeaderName) {
                      parsedName = validHeaderName
                      newlyExtracted = { ...newlyExtracted, nome: validHeaderName }
                    }
                  }
                  if (headerObj?.email && !newlyExtracted?.email) {
                    newlyExtracted = { ...newlyExtracted, email: headerObj.email }
                    hasNewEmail = true
                  }
                  if (headerObj?.telefone && !newlyExtracted?.telefone) {
                    newlyExtracted = { ...newlyExtracted, telefone: headerObj.telefone }
                    hasNewTelefone = true
                  }
                  if (headerObj?.cnh && !newlyExtracted?.cnh) {
                    newlyExtracted = { ...newlyExtracted, cnh: headerObj.cnh }
                  }
                  if (headerObj?.idade && !newlyExtracted?.idade) {
                    newlyExtracted = { ...newlyExtracted, idade: headerObj.idade }
                  }
                }
              } catch (dedErr: any) {
                console.warn(
                  `[reanalisar-candidato] Falha no OCR focado em cabeçalho:`,
                  dedErr?.message,
                )
              }
            }

            // Se o OCR falhou e nenhum dado pôde ser extraído (PDF puramente imagem), registrar o erro do Google Vision
            if (
              visionOcrError &&
              (!extractedText || extractedText.trim().length < 20) &&
              (!newlyExtracted?.nome || !newlyExtracted?.endereco)
            ) {
              currentDadosExtraidos = {
                ...currentDadosExtraidos,
                google_vision_error: visionOcrError,
              }
            }

            // Tentativa 3: Fallback de visão OpenAI via Files API + Responses API (gpt-4o) como último recurso
            const hasPostOcrExperiencia =
              Array.isArray(newlyExtracted?.experiencia_profissional) &&
              newlyExtracted.experiencia_profissional.length > 0
            const hasPostOcrFormacao =
              Array.isArray(newlyExtracted?.formacao_academica) &&
              newlyExtracted.formacao_academica.length > 0
            const hasPostOcrSkills =
              Array.isArray(newlyExtracted?.skills) && newlyExtracted.skills.length > 0
            const hasPostOcrObjetivo =
              typeof newlyExtracted?.objetivo === 'string' &&
              newlyExtracted.objetivo.trim().length > 0
            const isPostOcrBodyEmpty =
              !hasPostOcrExperiencia &&
              !hasPostOcrFormacao &&
              !hasPostOcrSkills &&
              !hasPostOcrObjetivo

            const stillNeedsVisionReextract =
              !parsedName ||
              (!hasNewTelefone && !hasNewEndereco && !hasNewEmail && isPostOcrBodyEmpty)

            if (
              stillNeedsVisionReextract &&
              !isDocx &&
              fileBytes.length > 0 &&
              fileBytes.length < 5 * 1024 * 1024
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
  "telefones_celulares": ["telefones celulares reais com DDD (11 dígitos, ex: 11953869329, nunca descartar 9 isolado)"],
  "telefone": "Telefone celular principal com DDD (11 dígitos, ex: 11953869329) ou null",
  "endereco": "Endereço COMPLETO com rua, número, bairro, cidade, UF e CEP (ex: R. Timóteo, 88 - Jardim Paraguaçu, São Paulo - SP, 03938-050) ou null",
  "cep": "CEP formatado 00000-000 ou null",
  "idade": "Número inteiro da idade ou null",
  "data_nascimento": "Data de nascimento informada ou null",
  "cnh": "Informação sobre CNH/Habilitação (ex: Categoria D) ou null",
  "cnh_categoria": "Categoria da CNH (ex: D, E, AB, AD, AE) ou null",
  "objetivo": "Cargo pretendido, objetivo profissional ou área de interesse informada no currículo ou null",
  "resumo_cv": "Resumo profissional ou qualificações ou null",
  "experiencia_profissional": [{"cargo": "Motorista", "empresa": "Nome da Empresa", "periodo": "02/2023 - Atual", "atual": true}],
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
              // Tenta extrair CEP do texto bruto caso newlyExtracted não possua
              if (!newlyExtracted.cep && extractedText) {
                const textCep = extractCep(extractedText)
                if (textCep) newlyExtracted.cep = textCep
              }
              // Se endereço não contém o CEP encontrado, anexa-o
              if (
                newlyExtracted.cep &&
                newlyExtracted.endereco &&
                typeof newlyExtracted.endereco === 'string'
              ) {
                if (!newlyExtracted.endereco.includes(newlyExtracted.cep)) {
                  newlyExtracted.endereco = `${newlyExtracted.endereco}, ${newlyExtracted.cep}`
                }
              }

              // Tenta regex adicional se data_nascimento estiver ausente
              if (!newlyExtracted.data_nascimento && extractedText) {
                const birthDateRegex =
                  /(?:nasc(?:ido|imento|ida)?(?:\s+em)?[:\s]+)?\b([0-3]?\d[\/\-\.][0-1]?\d[\/\-\.](?:19|20)\d{2})\b/i
                const matchDate = extractedText.match(birthDateRegex)
                if (matchDate && matchDate[1]) {
                  newlyExtracted.data_nascimento = matchDate[1]
                }
              }

              // Recalcular e sobrescrever idade caso haja data de nascimento
              const resolvedAge = resolveCandidateAge(
                newlyExtracted.idade,
                newlyExtracted.data_nascimento,
              )
              if (resolvedAge !== null) {
                newlyExtracted.idade = resolvedAge
              }
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
                // Se o nome atual era inválido ("Candidato Desconhecido" ou "Candidato") e não achou nome, tentar fallback por email
                if (cleanEmail) {
                  const prefix = cleanEmail.split('@')[0]
                  const formattedPrefix = prefix
                    .replace(/[._-]/g, ' ')
                    .replace(/\b\w/g, (l) => l.toUpperCase())
                  candidateUpdate.nome = formattedPrefix
                  currentNome = formattedPrefix
                }
              }

              if (cleanEmail) {
                candidateUpdate.email = cleanEmail
                currentEmail = cleanEmail
              }

              if (finalTelefone) {
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
              // Garantir que a idade derivada da data de nascimento seja refletida em currentDadosExtraidos
              const finalResolvedAge = resolveCandidateAge(
                currentDadosExtraidos.idade,
                currentDadosExtraidos.data_nascimento,
              )
              if (finalResolvedAge !== null) {
                currentDadosExtraidos.idade = finalResolvedAge
              }

              // Pós-processamento determinístico de CNH / Habilitação com fallback Regex
              currentDadosExtraidos = mergeExtractedCnh(currentDadosExtraidos, [
                extractedText,
                ocrCapturedText,
              ])
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

    // Se target_vaga_id foi fornecido expressamente, respeitá-lo sem sobrepor por salvaguarda de revisão anterior
    let motoristaEmRevisaoVagaId: string | null = null
    let motoristaEmRevisaoVagaTitulo: string = ''

    if (!target_vaga_id) {
      // =========================================================================
      // SALVAGUARDA 1: MOTORISTA EM "REVISAR"
      // Se existe uma análise prévia com resultado "revisar" para uma vaga de Motorista,
      // a reanálise NÃO PODE reclassificar o candidato para Cobrador ou outra vaga:
      // ele DEVE permanecer vinculado à vaga de Motorista, aguardando revisão humana (Paola).
      // =========================================================================
      const { data: previousMotoristaAnalises } = await supabase
        .from('analises')
        .select('id, vaga_id, resultado, criado_em, vagas (id, titulo)')
        .eq('candidato_id', candidato.id)
        .order('criado_em', { ascending: false })

      if (Array.isArray(previousMotoristaAnalises)) {
        for (const a of previousMotoristaAnalises) {
          const vagaObj: any = Array.isArray(a.vagas) ? a.vagas[0] : a.vagas
          const tituloVaga = (vagaObj?.titulo || '').toLowerCase()
          if (tituloVaga.includes('motorista') && a.resultado === 'revisar') {
            motoristaEmRevisaoVagaId = a.vaga_id
            motoristaEmRevisaoVagaTitulo = vagaObj?.titulo || 'Motorista'
            break
          }
        }
      }
    }

    // Reanálise identifica a vaga compatível com base no currículo atualizado
    // Envia Authorization Bearer service_role e header apikey
    const identifyHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey,
    }
    const incomingAuth = req.headers.get('Authorization')
    if (incomingAuth) {
      identifyHeaders['x-forwarded-auth'] = incomingAuth
    }

    let identifiedVagaId = target_vaga_id || null
    let justificativaIdentificacao = ''
    let identifyData: any = {}

    if (!identifiedVagaId) {
      const identifyRes = await fetch(`${supabaseUrl}/functions/v1/identify-vaga-from-cv`, {
        method: 'POST',
        headers: identifyHeaders,
        body: JSON.stringify({
          candidato_id: candidato.id,
          user_id: effectiveUserId,
          dados_extraidos: currentDadosExtraidos,
        }),
      })

      identifyData = await identifyRes.json()

      if (identifyData.error) {
        return new Response(JSON.stringify({ error: identifyData.error }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Trata descarte direto por raio (Regra 4)
      if (identifyData.descartado) {
        await supabase
          .from('candidatos')
          .update({
            vaga_id: null,
            etapa_id: null,
            ativo_kanban: false,
            motivo_inativo: 'fora do raio de todas as vagas',
            proximidade: 'fora_raio',
          })
          .eq('id', candidato.id)

        return new Response(
          JSON.stringify({
            success: true,
            descartado: true,
            motivo: identifyData.motivo_descarte || 'fora do raio de todas as vagas',
            justificativa: identifyData.justificativa,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // Trata aguardando vaga adequada (Regra 3)
      if (identifyData.aguardando_vaga) {
        await supabase
          .from('candidatos')
          .update({
            vaga_id: null,
            etapa_id: null,
            ativo_kanban: false,
            motivo_inativo: 'aguardando vaga adequada',
          })
          .eq('id', candidato.id)

        return new Response(
          JSON.stringify({
            success: true,
            aguardando_vaga: true,
            motivo: 'aguardando vaga adequada',
            justificativa: identifyData.justificativa,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      identifiedVagaId = identifyData.vaga_id || null
      justificativaIdentificacao =
        identifyData.justificativa || 'Nenhuma vaga compatível foi identificada no sistema.'
    } else {
      justificativaIdentificacao = 'Vaga alvo especificada explicitamente para reanálise.'
    }

    // Se temos análise prévia de Motorista com resultado "revisar", verificar se identify tentou desviar para não-motorista (ex: Cobrador)
    // EXCEÇÃO DA SALVAGUARDA: Se a análise "revisar" prévia de Motorista foi decorrente do bug de termos de ambiente
    // (ex.: candidato com objetivo específico sem vaga e experiências apenas de Caixa/Atendimento/Loja, SEM cargo de condução nem CNH D/E),
    // e o identify-vaga agora corrigiu o direcionamento para a vaga correta (ex.: Cobrador), permitir a correção!
    if (motoristaEmRevisaoVagaId) {
      // Buscar título da vaga identificada (se houver)
      let identifiedTitulo = ''
      if (identifiedVagaId) {
        const { data: idVagaObj } = await supabase
          .from('vagas')
          .select('titulo')
          .eq('id', identifiedVagaId)
          .maybeSingle()
        identifiedTitulo = (idVagaObj?.titulo || '').toLowerCase()
      }

      // Se a vaga identificada não for Motorista (ex: Cobrador) ou for nula:
      if (!identifiedTitulo.includes('motorista')) {
        // Verificar se o candidato realmente tem perfil/pretensão de motorista
        const rawObj = (currentDadosExtraidos?.objetivo || '').toLowerCase()
        const normObj = rawObj.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        const isTrueMotoristaObjective =
          normObj.includes('motorista') ||
          normObj.includes('condutor') ||
          normObj.includes('carreteiro') ||
          normObj.includes('motor apoio')

        // Checar CNH D ou E
        const cnhStr = (
          (currentDadosExtraidos?.cnh || '') +
          ' ' +
          (currentDadosExtraidos?.categoria_cnh || '') +
          ' ' +
          (Array.isArray(currentDadosExtraidos?.skills)
            ? currentDadosExtraidos.skills.join(' ')
            : '')
        ).toLowerCase()
        const hasTrueCnhDE =
          /\b(cnh|categoria|cat|habilitacao)\s*(categoria\s*)?([a-c]*d[a-e]*)\b/.test(cnhStr) ||
          /\bcnh\s*d\b/.test(cnhStr) ||
          /\bcategoria\s*d\b/.test(cnhStr) ||
          /\bcat\s*d\b/.test(cnhStr) ||
          /\b(cnh|categoria|cat|habilitacao)\s*(categoria\s*)?([a-d]*e)\b/.test(cnhStr) ||
          /\bcnh\s*e\b/.test(cnhStr) ||
          /\bcategoria\s*e\b/.test(cnhStr) ||
          /\bcat\s*e\b/.test(cnhStr)

        // Checar cargos de condução pesada/ônibus/caminhão (aplicativo/carro leve não conta!)
        const exps = Array.isArray(currentDadosExtraidos?.experiencia_profissional)
          ? currentDadosExtraidos.experiencia_profissional
          : []
        const hasTrueConducaoCargo = exps.some((item: any) => {
          const cargo = (
            typeof item === 'string' ? item : item.cargo || item.funcao || item.titulo || ''
          ).toLowerCase()
          const empresa = (
            typeof item === 'object' && item !== null ? item.empresa || '' : ''
          ).toLowerCase()
          const desc = (
            typeof item === 'object' && item !== null ? item.descricao || '' : ''
          ).toLowerCase()
          const fullItem = `${cargo} ${empresa} ${desc}`

          // Termos de aplicativo/carro de passeio
          const isApp =
            fullItem.includes('uber') ||
            fullItem.includes('99') ||
            fullItem.includes('aplicativo') ||
            fullItem.includes('pequeno porte') ||
            fullItem.includes('passeio')
          if (isApp) return false

          return (
            cargo.includes('motorista de onibus') ||
            cargo.includes('motorista de caminhao') ||
            cargo.includes('motorista coletivo') ||
            cargo.includes('carreteiro') ||
            cargo.includes('manobrista') ||
            (cargo.includes('motorista') && !cargo.includes('aplicativo'))
          )
        })

        // Se o candidato realmente tinha perfil/objetivo de Motorista ou condução real ou CNH D/E, a salvaguarda se mantém
        if (isTrueMotoristaObjective || hasTrueCnhDE || hasTrueConducaoCargo) {
          console.log(
            `[reanalisar-candidato] Salvaguarda ativada: candidato ${candidato.id} possui análise "revisar" em vaga de Motorista ("${motoristaEmRevisaoVagaTitulo}") e histórico/perfil condutor. Bloqueando reclassificação para "${identifiedTitulo || 'nenhuma'}" e mantendo vaga de Motorista.`,
          )
          identifiedVagaId = motoristaEmRevisaoVagaId
          justificativaIdentificacao = `Candidato possui análise em status "revisar" para a vaga de ${motoristaEmRevisaoVagaTitulo}. Pela regra de salvaguarda, permanece vinculado à vaga de Motorista aguardando revisão humana (Paola), não podendo ser reclassificado para Cobrador.`
        } else {
          console.log(
            `[reanalisar-candidato] Correção de fallback por experiência: candidato ${candidato.id} estava erroneamente em Motorista ("revisar"), mas NÃO possui cargo de condução, CNH D/E nem objetivo de motorista. Permitindo direcionamento correto para "${identifiedTitulo}".`,
          )
        }
      }
    }

    // =========================================================================
    // CASO 1: NENHUMA VAGA COMPATÍVEL IDENTIFICADA (vaga_id = null)
    // =========================================================================
    if (!identifiedVagaId) {
      console.log(
        `[reanalisar-candidato] Nenhuma vaga compatível para candidato ${candidato.id}. Limpando vaga_id e etapa_id, e marcando aguardando vaga adequada.`,
      )

      // 1. Limpa vaga_id e etapa_id do candidato e marca aguardando vaga adequada
      await supabase
        .from('candidatos')
        .update({
          vaga_id: null,
          etapa_id: null,
          ativo_kanban: false,
          motivo_inativo: 'aguardando vaga adequada',
        })
        .eq('id', candidato.id)

      // 2. Registra análise com resultado "nao_qualificado" e vaga_id null
      const hasObjetivo =
        typeof currentDadosExtraidos.objetivo === 'string' &&
        currentDadosExtraidos.objetivo.trim().length > 0

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
            criado_em: new Date().toISOString(),
          })
          .eq('id', existingNullAnalise.id)
          .select()
          .single()
        savedAnaliseData = updAnalise
      } else {
        const { data: insAnalise } = await supabase
          .from('analises')
          .insert({ ...analiseSemVagaPayload, criado_em: new Date().toISOString() })
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

    const analyzeHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseKey}`,
      apikey: supabaseKey,
    }
    if (incomingAuth) {
      analyzeHeaders['x-forwarded-auth'] = incomingAuth
    }

    const analyzeRes = await fetch(`${supabaseUrl}/functions/v1/analisar-cv-criterios`, {
      method: 'POST',
      headers: analyzeHeaders,
      body: JSON.stringify({
        cv_id: candidato.id,
        vaga_id: identifiedVagaId,
        user_id: effectiveUserId,
        enable_cascade: true,
      }),
    })

    const analyzeData = await analyzeRes.json()

    if (analyzeData.error) {
      console.error('[reanalisar-candidato] Erro retornado de analisar-cv-criterios:', analyzeData)
      return new Response(
        JSON.stringify({
          error: analyzeData.error,
          detalhes: analyzeData.detalhes || analyzeData,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // =========================================================================
    // SALVAGUARDA 1.7: SANITIZAÇÃO DE MOTIVO PARA EMPRESAS RESTRITAS (PASSADO vs ATUAL)
    // O candidato só elimina se estiver ATUALMENTE ativo na empresa restrita.
    // Experiência passada não elimina!
    // =========================================================================
    try {
      const analiseObj = analyzeData?.data?.analise
      if (analiseObj && analiseObj.detalhes) {
        let motivoDetalhes = analiseObj.detalhes.motivo || ''
        const motivoLow = motivoDetalhes.toLowerCase()

        if (
          motivoLow.includes('lista de restri') ||
          motivoLow.includes('teve experiência em empresas') ||
          motivoLow.includes('teve experiencia em empresas') ||
          motivoLow.includes('mobibrasil') ||
          motivoLow.includes('movebuss') ||
          motivoLow.includes('express') ||
          motivoLow.includes('transunião')
        ) {
          motivoDetalhes = motivoDetalhes
            .replace(
              /Reprovado por critério da vaga: candidato teve experiência em empresas que estão na lista de restrição\.?/gi,
              '',
            )
            .replace(
              /candidato teve experiência em empresas que estão na lista de restrição\.?/gi,
              '',
            )
            .replace(/e por possuir vínculo atual com a empresa [^,.]*[,.]?/gi, '')
            .replace(/por possuir vínculo atual com a empresa [^,.]*[,.]?/gi, '')
            .replace(/vínculo atual com a empresa [^,.]*[,.]?/gi, '')
            .replace(/vínculo atual com [^,.]*[,.]?/gi, '')
            .replace(/vinculo atual com a empresa [^,.]*[,.]?/gi, '')
            .replace(/vinculo atual com [^,.]*[,.]?/gi, '')
            .replace(/Candidato está atualmente empregado na [^,.]*[,.]?/gi, '')
            .replace(/Candidato possui vínculo atual com a empresa [^,.]*[,.]?/gi, '')
            .replace(/Candidato possui vinculo atual com a empresa [^,.]*[,.]?/gi, '')
            .replace(/empresa da lista restrita[.,]?/gi, '')
            .replace(/que está na lista de empresas restritas[.,]?/gi, '')
            .replace(/que esta na lista de empresas restritas[.,]?/gi, '')
            .replace(/Não atende aos critérios eliminatórios da vaga:\s*\.?\s*/gi, '')
            .trim()

          analiseObj.detalhes.motivo =
            motivoDetalhes ||
            'Candidato com experiência passada em empresa de ônibus (vínculo encerrado; não elimina).'
          await supabase
            .from('analises')
            .update({ detalhes: analiseObj.detalhes })
            .eq('id', analiseObj.id)
        }
      }
    } catch (restErr: any) {
      console.warn(
        '[reanalisar-candidato] Erro ao sanitizar motivo de empresa restrita:',
        restErr?.message,
      )
    }

    // =========================================================================
    // SALVAGUARDA 1.8: SANITIZAÇÃO DE MOTIVO PARA CRITÉRIOS ALTERNATIVOS COM "OU"
    // Critérios alternativos com "OU" (ex.: "Categoria D ou E") aceitam qualquer uma das opções.
    // Caso a análise retorne menção errônea a "CNH deve ser E" para vagas que aceitam "D ou E"
    // quando o candidato possui CNH D, sanitizar para garantir consistência.
    // =========================================================================
    try {
      const analiseObj = analyzeData?.data?.analise
      if (analiseObj && analiseObj.detalhes) {
        let motivoDetalhes = analiseObj.detalhes.motivo || ''
        const motivoLow = motivoDetalhes.toLowerCase()
        if (
          motivoLow.includes('deve ser e') ||
          motivoLow.includes('somente e') ||
          motivoLow.includes('requer categoria e')
        ) {
          const { data: vagaObjParaCnh } = await supabase
            .from('vagas')
            .select('criterios_qualificacao')
            .eq('id', identifiedVagaId)
            .maybeSingle()

          const vCrit = JSON.stringify(vagaObjParaCnh?.criterios_qualificacao || '').toLowerCase()
          if (vCrit.includes('categoria d ou e') || vCrit.includes('d ou e')) {
            motivoDetalhes = motivoDetalhes
              .replace(
                /e por não atender o critério eliminatório de Categoria da CNH[^,.]*[,.]?/gi,
                '',
              )
              .replace(/por não atender o critério eliminatório de Categoria da CNH[^,.]*e /gi, '')
              .replace(/não atender o critério eliminatório de Categoria da CNH[^,.]*[,.]?/gi, '')
              .replace(/que deve ser E[,.]?/gi, '')
              .replace(/requer Categoria E[^,.]*[,.]?/gi, '')
              .trim()

            analiseObj.detalhes.motivo = motivoDetalhes
            await supabase
              .from('analises')
              .update({ detalhes: analiseObj.detalhes })
              .eq('id', analiseObj.id)
          }
        }
      }
    } catch (cleanErr: any) {
      console.warn('[reanalisar-candidato] Erro ao sanitizar motivo de análise:', cleanErr?.message)
    }

    // =========================================================================
    // SALVAGUARDA 2: PÓS-ANÁLISE E PRIORIDADE MOTORISTA
    // Se o candidato foi analisado para Motorista e tiver análises anteriores de Cobrador,
    // ou se o candidato atende a Motorista e Cobrador:
    // 1. Prioridade absoluta para Motorista.
    // 2. Se o resultado para Motorista for "revisar", ele DEVE permanecer em "revisar" na vaga de Motorista,
    //    e NUNCA ser rebaixado para Cobrador.
    // =========================================================================
    const { data: currentVagaData } = await supabase
      .from('vagas')
      .select('titulo')
      .eq('id', identifiedVagaId)
      .maybeSingle()

    const isCurrentMotorista = (currentVagaData?.titulo || '').toLowerCase().includes('motorista')

    if (isCurrentMotorista) {
      // Garantir que a vaga principal do candidato permaneça a de Motorista
      await supabase.from('candidatos').update({ vaga_id: identifiedVagaId }).eq('id', candidato.id)
    }

    // =========================================================================
    // SALVAGUARDA 3: REATIVAÇÃO AUTOMÁTICA NO KANBAN QUANDO QUALIFICADO
    // Se o resultado atualizado for 'qualificado' e o candidato estiver inativo
    // com motivo_inativo = 'Não Qualificado', reativá-lo:
    // ativo_kanban = true, motivo_inativo = null, mantendo a etapa (Triagem).
    // Motivos manuais ('Retirado Kanban', 'Duplicado...') são preservados.
    // =========================================================================
    try {
      const finalResultado =
        analyzeData?.data?.analise?.resultado || analyzeData?.analise?.resultado

      if (finalResultado === 'qualificado') {
        const { data: candStatus } = await supabase
          .from('candidatos')
          .select('ativo_kanban, motivo_inativo, etapa_id')
          .eq('id', candidato.id)
          .maybeSingle()

        const upd: Record<string, any> = {}

        if (
          candStatus &&
          candStatus.ativo_kanban === false &&
          typeof candStatus.motivo_inativo === 'string' &&
          candStatus.motivo_inativo.toLowerCase().includes('não qualificado')
        ) {
          upd.ativo_kanban = true
          upd.motivo_inativo = null
        }

        if (target_etapa) {
          const { data: etapaObj } = await supabase
            .from('etapas')
            .select('id')
            .ilike('nome', target_etapa)
            .maybeSingle()
          if (etapaObj?.id) {
            upd.etapa_id = etapaObj.id
          }
        } else if (!candStatus?.etapa_id) {
          const { data: etapaTriagem } = await supabase
            .from('etapas')
            .select('id')
            .ilike('nome', 'Triagem')
            .maybeSingle()
          if (etapaTriagem?.id) {
            upd.etapa_id = etapaTriagem.id
          }
        }

        if (Object.keys(upd).length > 0) {
          await supabase.from('candidatos').update(upd).eq('id', candidato.id)
          console.log(
            `[reanalisar-candidato] Candidato ${candidato.id} atualizado pós-qualificação:`,
            upd,
          )
        }
      }
    } catch (reactivateErr: any) {
      console.warn(
        '[reanalisar-candidato] Aviso ao verificar reativação de candidato:',
        reactivateErr?.message,
      )
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

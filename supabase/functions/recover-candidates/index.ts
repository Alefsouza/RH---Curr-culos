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
import { extractTextFromPdfBytes } from '../_shared/pdf.ts'

interface ExtractedCandidateData {
  nome: string | null
  email: string | null
  telefones_celulares?: string[]
  telefone?: string | null
  endereco?: string | null
  idade?: number | string | null
  data_nascimento?: string | null
  objetivo?: string | null
  resumo_cv?: string | null
  experiencia_profissional?: string[] | string
  skills?: string[] | string
  formacao_academica?: string[] | string
  [key: string]: any
}
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  console.log('Iniciando recuperação e extração completa de candidatos a partir do Storage...')

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)

    const openaiKey = Deno.env.get('OPENAI_KEY') || Deno.env.get('OPENIA_KEY')
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: 'Chave OPENAI_KEY não configurada no servidor.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const openai = new OpenAI({ apiKey: openaiKey })

    // 1. Obter Usuário Responsável
    const { data: tiUser } = await supabaseAdmin
      .from('usuarios')
      .select('id')
      .eq('email', 'ti@viasudeste.com')
      .maybeSingle()

    let effectiveUserId = tiUser?.id
    if (!effectiveUserId) {
      const { data: fallbackUser } = await supabaseAdmin
        .from('usuarios')
        .select('id')
        .order('criado_em', { ascending: true })
        .limit(1)
        .maybeSingle()
      effectiveUserId = fallbackUser?.id
    }

    if (!effectiveUserId) {
      return new Response(
        JSON.stringify({ error: 'Nenhum usuário responsável encontrado no sistema.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 2. Obter Etapa ID da "Triagem"
    const { data: etapaTriagem } = await supabaseAdmin
      .from('etapas')
      .select('id')
      .ilike('nome', 'Triagem')
      .order('ordem', { ascending: true })
      .limit(1)
      .maybeSingle()

    let triagemEtapaId = etapaTriagem?.id
    if (!triagemEtapaId) {
      const { data: firstEtapa } = await supabaseAdmin
        .from('etapas')
        .select('id')
        .order('ordem', { ascending: true })
        .limit(1)
        .maybeSingle()
      triagemEtapaId = firstEtapa?.id || null
    }

    // 3. Helper recursivo para listar todos os arquivos do bucket `curriculos`
    const listAllPdfsRecursively = async (path = ''): Promise<string[]> => {
      const pdfPaths: string[] = []
      let offset = 0
      const limit = 100

      while (true) {
        const { data, error } = await supabaseAdmin.storage
          .from('curriculos')
          .list(path, { limit, offset, sortBy: { column: 'name', order: 'asc' } })

        if (error) {
          console.error(`Erro ao listar storage em "${path}":`, error)
          break
        }

        if (!data || data.length === 0) break

        for (const item of data) {
          const itemPath = path ? `${path}/${item.name}` : item.name
          if (!item.id && !item.metadata) {
            // Diretório
            const subFiles = await listAllPdfsRecursively(itemPath)
            pdfPaths.push(...subFiles)
          } else if (
            item.name.toLowerCase().endsWith('.pdf') ||
            item.name.toLowerCase().endsWith('.docx')
          ) {
            pdfPaths.push(itemPath)
          }
        }

        if (data.length < limit) break
        offset += limit
      }

      return pdfPaths
    }

    console.log('Varrendo arquivos no bucket "curriculos"...')
    const allPdfPaths = await listAllPdfsRecursively('')
    console.log(`Total de arquivos encontrados no Storage: ${allPdfPaths.length}`)

    // 4. Buscar curriculo_url de candidatos já existentes para checagem rápida
    const { data: existingCandidatesData } = await supabaseAdmin
      .from('candidatos')
      .select('curriculo_url')
      .not('curriculo_url', 'is', null)

    const existingUrls = new Set(
      (existingCandidatesData || [])
        .map((c) => c.curriculo_url)
        .filter((u): u is string => Boolean(u)),
    )

    const isPdfAlreadyRegistered = (filePath: string, publicUrl: string): boolean => {
      if (existingUrls.has(publicUrl)) return true
      for (const url of existingUrls) {
        if (url.includes(filePath) || filePath.includes(url)) {
          return true
        }
      }
      return false
    }

    const results = {
      total_candidatos: allPdfPaths.length,
      total_pdfs_encontrados: allPdfPaths.length,
      inseridos: 0,
      sucesso: 0,
      pulados: 0,
      pulados_existentes: 0,
      pulados_duplicados: 0,
      falhas: 0,
      detalhes_falhas: [] as { arquivo: string; erro: string; path?: string; motivo?: string }[],
      detalhes: [] as {
        arquivo: string
        status: 'inserido' | 'pulado' | 'falha'
        nome?: string | null
        email?: string | null
        telefone?: string | null
        vaga_id?: string | null
        erro?: string
        motivo?: string
      }[],
      tempo_total_segundos: 0,
    }

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
      messages: any[],
      retries = 3,
      delays = [2000, 4000, 8000],
    ): Promise<any> => {
      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          response_format: { type: 'json_object' },
        })
        return JSON.parse(response.choices[0].message.content || '{}')
      } catch (error: any) {
        if (retries > 0 && isRetryableError(error)) {
          const delay = delays[3 - retries] ?? 8000
          console.log(`OpenAI retry em ${delay}ms... (${retries} restantes)`)
          await new Promise((res) => setTimeout(res, delay))
          return callOpenAIWithRetry(messages, retries - 1, delays)
        }
        throw error
      }
    }

    const extractCandidateDataFromPdf = async (
      pdfBytes: Uint8Array,
      filePath: string,
    ): Promise<{ extractedData: ExtractedCandidateData; rawText: string } | null> => {
      const basicText = await extractTextFromPdfBytes(pdfBytes)

      if (!basicText || basicText.trim().length < 50) {
        console.warn(
          `[extractCandidateDataFromPdf] Arquivo ${filePath} não contém texto legível suficiente (< 50 caracteres).`,
        )
        return null
      }

      const systemPrompt =
        'Você é um especialista em RH e análise de currículos. Extraia com precisão os dados cadastrais e profissionais do documento enviado em português brasileiro. Preserve rigorosamente todos os acentos e caracteres especiais da língua portuguesa (ç, ã, õ, etc.). NUNCA invente dados nem use nomes genéricos ("Candidato Desconhecido", "João da Silva"). Se não conseguir identificar o nome real com certeza, retorne null. Não duplique nomes (evite "Lucas Lucas"). Responda ESTRITAMENTE em JSON válido.'

      const promptText = `Analise o currículo (arquivo: ${filePath}) e extraia todos os dados estruturados:
- nome: Nome completo REAL extraído do currículo, ou null se não identificado
- email: Endereço de e-mail REAL válido, ou null se não identificado
- telefones_celulares: Lista de telefones celulares brasileiros REAIS com DDD (ex: ["11987654321"]) ou [] se nenhum
- telefone: Telefone celular principal ou null
- endereco: Cidade, estado ou endereço completo, ou null se não identificado
- idade: Idade expressa em número inteiro (ex: 31, 20) ou calculada a partir da data de nascimento se informada, ou null se não constar
- data_nascimento: Data de nascimento informada (ex: "16/01/1993" ou "1993-01-16"), ou null se não constar
- objetivo: Cargo pretendido, objetivo profissional ou área de interesse informada no currículo (ex: "Cobrador de Ônibus", "Motorista", "Auxiliar Administrativo"), ou null se não identificado
- resumo_cv: Resumo das qualificações e perfil profissional, ou null se não identificado
- experiencia_profissional: Lista de experiências anteriores, ou []
- skills: Lista de habilidades e competências, ou []
- formacao_academica: Lista de cursos, escolaridade, certificações e credenciais (ex: "Credencial de Transporte Coletivo", "Curso de Transporte Coletivo de Passageiros"), ou []

IMPORTANTE:
1. NUNCA invente dados fictícios.
2. NUNCA use a string "string ou null" ou "string". Use null real.
3. Capture a idade ou data de nascimento se constar no documento.
4. Capture o "objetivo" com prioridade para facilitar o matching de vagas.

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
  "resumo_cv": null,
  "experiencia_profissional": [],
  "skills": [],
  "formacao_academica": []
}`

      const messages = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `${promptText}\n\nTexto extraído do PDF:\n${basicText.substring(0, 20000)}`,
        },
      ]

      const parsedJson: ExtractedCandidateData = await callOpenAIWithRetry(messages)

      const rawTextToMatch = [
        parsedJson.objetivo ? `Objetivo / Cargo Pretendido: ${parsedJson.objetivo}` : '',
        parsedJson.resumo_cv || '',
        Array.isArray(parsedJson.experiencia_profissional)
          ? parsedJson.experiencia_profissional.join('\n')
          : parsedJson.experiencia_profissional || '',
        Array.isArray(parsedJson.skills) ? parsedJson.skills.join(', ') : parsedJson.skills || '',
        Array.isArray(parsedJson.formacao_academica)
          ? parsedJson.formacao_academica.join('\n')
          : parsedJson.formacao_academica || '',
        basicText,
      ]
        .filter(Boolean)
        .join('\n\n')

      return {
        extractedData: parsedJson,
        rawText: rawTextToMatch || basicText,
      }
    }

    const processCandidatePdf = async (filePath: string) => {
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/curriculos/${filePath}`

      if (isPdfAlreadyRegistered(filePath, publicUrl)) {
        console.log(`[PULADO] Arquivo já indexado: ${filePath}`)
        results.pulados++
        results.pulados_existentes++
        results.detalhes.push({
          arquivo: filePath,
          status: 'pulado',
        })
        return
      }

      console.log(`[PROCESSANDO] Baixando do Storage: ${filePath}...`)
      const { data: fileBlob, error: downloadError } = await supabaseAdmin.storage
        .from('curriculos')
        .download(filePath)

      if (downloadError || !fileBlob) {
        throw new Error(
          `Falha ao baixar arquivo do Storage: ${downloadError?.message || 'Arquivo não encontrado'}`,
        )
      }

      const arrayBuffer = await fileBlob.arrayBuffer()
      const pdfBytes = new Uint8Array(arrayBuffer)

      if (pdfBytes.length === 0) {
        throw new Error('Arquivo vazio (0 bytes).')
      }

      console.log(`[EXTRAÇÃO IA] Extraindo dados do currículo: ${filePath}...`)
      const extractionResult = await extractCandidateDataFromPdf(pdfBytes, filePath)
      if (!extractionResult) {
        throw new Error('PDF não possui texto legível suficiente (< 50 caracteres / escaneado).')
      }
      const { extractedData, rawText } = extractionResult

      const cleanCandidateName = sanitizeAndValidateName(extractedData.nome)
      const cleanCandidateEmail = sanitizeAndValidateEmail(extractedData.email)

      if (!cleanCandidateName) {
        throw new Error(
          'Não foi possível extrair um nome de candidato real e válido do PDF. Candidato ignorado.',
        )
      }

      let telefonesArr: string[] = []
      if (Array.isArray(extractedData.telefones_celulares)) {
        telefonesArr = extractedData.telefones_celulares
      } else if (extractedData.telefone) {
        telefonesArr = [extractedData.telefone]
      }

      const rawTelefone = telefonesArr.length > 0 ? telefonesArr.join(',') : null
      let normalizedTelefone = null
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
        normalizedTelefone = uniqueParts.length > 0 ? uniqueParts.join(',') : null
      }

      const finalNome = cleanCandidateName
      const finalEmail = cleanCandidateEmail
      const finalTelefone = normalizedTelefone

      let isDuplicate = false
      let duplicateReason = ''

      if (finalEmail) {
        const { data: emailDup, error: emailErr } = await supabaseAdmin
          .from('candidatos')
          .select('id, nome, email')
          .ilike('email', finalEmail)
          .limit(1)
          .maybeSingle()

        if (!emailErr && emailDup) {
          isDuplicate = true
          duplicateReason = `Candidato já cadastrado com o e-mail: ${finalEmail} (${emailDup.nome})`
        }
      }

      if (!isDuplicate && cleanCandidateName && finalTelefone) {
        const tels = finalTelefone
          .split(',')
          .map((t: string) => t.trim())
          .filter(Boolean)

        for (const tel of tels) {
          const { data: phoneDup, error: phoneErr } = await supabaseAdmin
            .from('candidatos')
            .select('id, nome, telefone')
            .ilike('nome', cleanCandidateName)
            .ilike('telefone', `%${tel}%`)
            .limit(1)
            .maybeSingle()

          if (!phoneErr && phoneDup) {
            isDuplicate = true
            duplicateReason = `Candidato já cadastrado com o mesmo nome e telefone: ${cleanCandidateName} (${tel})`
            break
          }
        }
      }

      if (isDuplicate) {
        console.log(`[PULADO DUPLICADO] ${duplicateReason} [Arquivo: ${filePath}]`)
        results.pulados++
        results.pulados_duplicados++
        results.detalhes.push({
          arquivo: filePath,
          status: 'pulado',
          nome: finalNome,
          email: finalEmail,
          telefone: finalTelefone,
          motivo: duplicateReason,
        })
        return
      }

      console.log(`[IDENTIFY-VAGA] Identificando vaga compatível para ${finalNome}...`)
      let identifiedVagaId: string | null = null

      try {
        const identifyRes = await supabaseAdmin.functions.invoke('identify-vaga-from-cv', {
          body: {
            texto_cv: rawText,
            dados_extraidos: extractedData,
            user_id: effectiveUserId,
          },
        })

        if (identifyRes.data?.vaga_id) {
          identifiedVagaId = identifyRes.data.vaga_id
        }
      } catch (idErr: any) {
        console.warn(`Erro ao chamar identify-vaga-from-cv para ${filePath}:`, idErr?.message)
      }

      console.log(`[INSERT CANDIDATO] Inserindo candidato ${finalNome} no banco de dados...`)
      const candidatePayload = {
        nome: finalNome,
        email: finalEmail,
        telefone: finalTelefone,
        vaga_id: identifiedVagaId,
        curriculo_url: publicUrl,
        etapa_id: triagemEtapaId,
        fonte: 'recuperacao_storage',
        dados_extraidos: extractedData,
        user_id: effectiveUserId,
        criado_em: new Date().toISOString(),
      }

      const { data: insertedCandidate, error: insertError } = await supabaseAdmin
        .from('candidatos')
        .insert(candidatePayload)
        .select('id')
        .single()

      if (insertError || !insertedCandidate) {
        throw new Error(
          `Erro ao inserir candidato no banco: ${insertError?.message || 'Falha no insert'}`,
        )
      }

      const candidateId = insertedCandidate.id

      if (triagemEtapaId) {
        await supabaseAdmin.from('candidato_etapa').insert({
          candidato_id: candidateId,
          etapa_id: triagemEtapaId,
          usuario_id: effectiveUserId,
        })
      }

      existingUrls.add(publicUrl)

      results.inseridos++
      results.sucesso++
      results.detalhes.push({
        arquivo: filePath,
        status: 'inserido',
        nome: finalNome,
        email: finalEmail,
        telefone: finalTelefone,
        vaga_id: identifiedVagaId,
      })

      console.log(`[SUCESSO] Candidato "${finalNome}" recuperado com sucesso (${filePath})!`)
    }

    const BATCH_SIZE = 5
    for (let i = 0; i < allPdfPaths.length; i += BATCH_SIZE) {
      const batch = allPdfPaths.slice(i, i + BATCH_SIZE)
      console.log(
        `Processando lote ${Math.floor(i / BATCH_SIZE) + 1} de ${Math.ceil(allPdfPaths.length / BATCH_SIZE)} (itens ${i + 1} a ${Math.min(i + BATCH_SIZE, allPdfPaths.length)})...`,
      )

      const settledResults = await Promise.allSettled(
        batch.map((filePath) => processCandidatePdf(filePath)),
      )

      for (let j = 0; j < settledResults.length; j++) {
        const outcome = settledResults[j]
        const filePath = batch[j]
        if (outcome.status === 'rejected') {
          const errMsg = outcome.reason?.message || String(outcome.reason) || 'Erro desconhecido'
          console.error(`[FALHA] Erro no arquivo ${filePath}:`, errMsg)
          results.falhas++
          results.detalhes_falhas.push({
            arquivo: filePath,
            erro: errMsg,
            path: filePath,
            motivo: errMsg,
          })
          results.detalhes.push({
            arquivo: filePath,
            status: 'falha',
            erro: errMsg,
          })
        }
      }
    }

    results.tempo_total_segundos = Math.round(((Date.now() - startTime) / 1000) * 10) / 10

    return new Response(
      JSON.stringify({
        success: true,
        resumo: results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error: any) {
    console.error('Erro geral em recover-candidates:', error)
    return new Response(
      JSON.stringify({
        error: 'Erro durante a execução de recover-candidates.',
        detalhes: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})

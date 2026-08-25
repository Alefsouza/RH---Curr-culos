import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'
import { corsHeaders } from '../_shared/cors.ts'
import { normalizePhone } from '../_shared/phone.ts'

// Helper para converter Uint8Array em Base64 usando Web APIs padrão (sem node:buffer)
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  const len = bytes.byteLength
  const chunkSize = 8192
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len))
    binary += String.fromCharCode.apply(null, chunk as unknown as number[])
  }
  return btoa(binary)
}

// Extrai texto bruto contido em streams/objetos do PDF via regex simples
function extractAsciiTextFromPdfBytes(bytes: Uint8Array): string {
  const textDecoder = new TextDecoder('latin1')
  const raw = textDecoder.decode(bytes)

  const textChunks: string[] = []

  // Procura blocos BT ... ET no PDF
  const btMatches = raw.matchAll(/BT[\s\S]*?ET/g)
  for (const match of btMatches) {
    const block = match[0]
    // Procura strings literais (texto)
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
    // Procura strings hex <48656c6c6f>
    const hexMatches = block.matchAll(/<([0-9a-fA-F\s]+)>/g)
    for (const hex of hexMatches) {
      const cleanHex = hex[1].replace(/\s+/g, '')
      if (cleanHex.length % 2 === 0 && cleanHex.length >= 4) {
        let str = ''
        for (let k = 0; k < cleanHex.length; k += 2) {
          const code = parseInt(cleanHex.substring(k, k + 2), 16)
          if (code >= 32 && code <= 126) {
            str += String.fromCharCode(code)
          }
        }
        if (str.trim().length > 0) {
          textChunks.push(str)
        }
      }
    }
  }

  return textChunks.join(' ').replace(/\s+/g, ' ').trim()
}

interface ExtractedCandidateData {
  nome: string | null
  email: string | null
  telefones_celulares?: string[]
  telefone?: string | null
  endereco?: string | null
  experiencia_profissional?: string[] | string
  skills?: string[] | string
  formacao_academica?: string[] | string
  resumo_cv?: string | null
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

    // 1. Obter Usuário Responsável (ti@viasudeste.com ou fallback primeiro usuário)
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
          } else if (item.name.toLowerCase().endsWith('.pdf')) {
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
    console.log(`Total de arquivos PDF encontrados no Storage: ${allPdfPaths.length}`)

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
      }[],
      tempo_total_segundos: 0,
    }

    // Helper com retry para OpenAI
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

    // Função de extração de dados do PDF via OpenAI
    const extractCandidateDataFromPdf = async (
      pdfBytes: Uint8Array,
      filePath: string,
    ): Promise<{ extractedData: ExtractedCandidateData; rawText: string }> => {
      // 1. Tentar extrair texto básico via regex nos streams do PDF
      const basicText = extractAsciiTextFromPdfBytes(pdfBytes)
      const base64Data = uint8ArrayToBase64(pdfBytes)

      const systemPrompt =
        'Você é um especialista em RH e análise de currículos. Extraia com precisão os dados cadastrais e profissionais do documento enviado. Responda ESTRITAMENTE em JSON válido.'

      let promptText = `Analise o currículo (arquivo: ${filePath}) e extraia todos os dados estruturados.
Extraia com cuidado:
- nome (nome completo do candidato)
- email (endereço de e-mail válido)
- telefones_celulares (lista de telefones celulares brasileiros com DDD, preferencialmente 11 dígitos, ex: 11999999999)
- telefone (telefone principal formatado ou null)
- endereco (cidade, estado ou endereço completo)
- resumo_cv (resumo das qualificações e perfil profissional)
- experiencia_profissional (lista de experiências anteriores com cargos e empresas)
- skills (lista de habilidades técnicas e competências)
- formacao_academica (lista de formações acadêmicas e cursos)

Formato JSON estrito esperado:
{
  "nome": "string ou null",
  "email": "string ou null",
  "telefones_celulares": ["string"],
  "telefone": "string ou null",
  "endereco": "string ou null",
  "resumo_cv": "string ou null",
  "experiencia_profissional": ["string"],
  "skills": ["string"],
  "formacao_academica": ["string"]
}`

      let messages: any[] = []

      // Se temos texto ASCII legível relevante (> 60 caracteres)
      if (basicText.length > 60) {
        messages = [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `${promptText}\n\nTexto extraído do PDF:\n${basicText.substring(0, 20000)}`,
          },
        ]
      } else {
        // Envia o PDF em base64 como anexo / data-uri
        messages = [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: promptText,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:application/pdf;base64,${base64Data}`,
                  detail: 'high',
                },
              },
            ],
          },
        ]
      }

      let parsedJson: ExtractedCandidateData
      try {
        parsedJson = await callOpenAIWithRetry(messages)
      } catch (firstErr) {
        // Se falhou com base64 / data-uri, tenta fallback com o texto bruto mesmo que curto
        console.warn(`Tentando fallback de extração para ${filePath}:`, firstErr)
        messages = [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `${promptText}\n\nConteúdo disponível do arquivo:\n${basicText.substring(0, 10000)}`,
          },
        ]
        parsedJson = await callOpenAIWithRetry(messages)
      }

      const rawTextToMatch = [
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

    // Processamento individual de um PDF com todas as etapas solicitadas
    const processCandidatePdf = async (filePath: string) => {
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/curriculos/${filePath}`

      // 2. Pular arquivos que já têm candidato correspondente
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

      // 3. Para cada PDF NOVO:
      // a. Baixar o PDF do Storage
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

      // b & c. Converter para base64 e chamar OpenAI para extrair nome, email, telefone, etc.
      console.log(`[EXTRAÇÃO IA] Extraindo dados do currículo: ${filePath}...`)
      const { extractedData, rawText } = await extractCandidateDataFromPdf(pdfBytes, filePath)

      // Validação obrigatória: nome e/ou email
      const candidateName = extractedData.nome ? String(extractedData.nome).trim() : null
      const candidateEmail = extractedData.email ? String(extractedData.email).trim() : null

      if (!candidateName && !candidateEmail) {
        throw new Error('Não foi possível extrair nome e email válidos do PDF. Candidato ignorado.')
      }

      // Normalizar telefones
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
        const normalizedParts = parts
          .map((t: string) => {
            const n = normalizePhone(t)
            return n && n.length >= 10 && n.length <= 11 ? n : null
          })
          .filter(Boolean)
        const uniqueParts = Array.from(new Set(normalizedParts))
        normalizedTelefone = uniqueParts.length > 0 ? uniqueParts.join(',') : rawTelefone
      }

      const finalNome = candidateName || 'Candidato Desconhecido'
      const finalEmail = candidateEmail || null
      const finalTelefone = normalizedTelefone

      // d. Chamar `identify-vaga-from-cv` passando o texto / dados extraídos para identificar a vaga
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

        if (identifyRes.error) {
          console.warn(`Aviso em identify-vaga-from-cv para ${filePath}:`, identifyRes.error)
        } else if (identifyRes.data?.vaga_id) {
          identifiedVagaId = identifyRes.data.vaga_id
          console.log(`[VAGA ENCONTRADA] Vaga ${identifiedVagaId} vinculada a ${finalNome}`)
        }
      } catch (idErr: any) {
        console.warn(`Erro ao chamar identify-vaga-from-cv para ${filePath}:`, idErr?.message)
      }

      // e. SÓ ENTÃO inserir o candidato na tabela `candidatos` com todos os dados preenchidos:
      // nome, email, telefone, vaga_id, curriculo_url, etapa_id = Triagem, status = "Triagem", fonte = "recuperacao_storage"
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

      // Inserir em candidato_etapa com etapa Triagem
      if (triagemEtapaId) {
        const { error: etapaRelError } = await supabaseAdmin.from('candidato_etapa').insert({
          candidato_id: candidateId,
          etapa_id: triagemEtapaId,
          usuario_id: effectiveUserId,
        })

        if (etapaRelError) {
          console.warn(
            `Aviso ao inserir histórico de etapa para ${candidateId}:`,
            etapaRelError.message,
          )
        }
      }

      // Adiciona à lista de URLs existentes em memória para evitar duplicações no mesmo lote
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

    // 4. Processar em lotes de 5 com Promise.allSettled
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

    console.log('Recuperação finalizada com sucesso:', {
      total: results.total_candidatos,
      inseridos: results.inseridos,
      pulados: results.pulados,
      falhas: results.falhas,
      tempo: results.tempo_total_segundos,
    })

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

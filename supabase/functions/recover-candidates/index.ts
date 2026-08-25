import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'
import { Buffer } from 'node:buffer'
import pdf from 'npm:pdf-parse@1.1.1'
import { corsHeaders } from '../_shared/cors.ts'
import { normalizePhone } from '../_shared/phone.ts'

interface StorageFile {
  name: string
  id?: string
  metadata?: Record<string, any>
  created_at?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  console.log('Iniciando processo de recuperação de candidatos via recover-candidates...')

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)

    // 1. Obter User ID do TI (ti@viasudeste.com)
    const { data: tiUser, error: tiUserError } = await supabaseAdmin
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
        JSON.stringify({ error: 'Nenhum usuário responsável encontrado (ti@viasudeste.com).' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 2. Obter Etapa ID da Triagem (select id from public.etapas where nome = 'Triagem' order by ordem asc limit 1)
    const { data: etapaTriagem, error: etapaError } = await supabaseAdmin
      .from('etapas')
      .select('id')
      .ilike('nome', 'Triagem')
      .order('ordem', { ascending: true })
      .limit(1)
      .maybeSingle()

    const triagemEtapaId = etapaTriagem?.id || null

    // 3. Inicializar OpenAI
    const openaiKey =
      Deno.env.get('OPENAI_KEY') || Deno.env.get('OPENIA_KEY') || Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: 'Chave OPENAI_KEY não configurada no servidor.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    const openai = new OpenAI({ apiKey: openaiKey })

    // Helper recursivo para listar todos os arquivos do bucket `curriculos`
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
          // If item is a folder (no id or metadata with null/folder characteristics)
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

    const results = {
      total_pdfs_encontrados: allPdfPaths.length,
      sucesso: 0,
      pulados_existentes: 0,
      falhas: 0,
      detalhes_falhas: [] as { path: string; motivo: string }[],
      tempo_total_segundos: 0,
    }

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
            `OpenAI erro (${error?.status || error?.message}), retentando em ${delay}ms...`,
          )
          await new Promise((resolve) => setTimeout(resolve, delay))
          return callOpenAIWithRetry(prompt, retries - 1, delays)
        }
        throw error
      }
    }

    // Função de processamento individual de um PDF
    const processSinglePdf = async (filePath: string) => {
      try {
        // a. Baixar o arquivo do Storage
        const { data: fileData, error: downloadError } = await supabaseAdmin.storage
          .from('curriculos')
          .download(filePath)

        if (downloadError || !fileData) {
          throw new Error(
            `Erro ao baixar arquivo do Storage: ${downloadError?.message || 'Arquivo vazio'}`,
          )
        }

        // Extrair texto do PDF
        const arrayBuffer = await fileData.arrayBuffer()
        const fileBuffer = Buffer.from(arrayBuffer)
        let extractedText = ''
        try {
          const parsed = await pdf(fileBuffer)
          extractedText = parsed.text || ''
        } catch (pdfErr: any) {
          throw new Error(`Falha ao extrair texto do PDF: ${pdfErr.message}`)
        }

        if (!extractedText.trim()) {
          throw new Error('PDF vazio ou ilegível (sem texto extraível).')
        }

        // b. Extrair informações com OpenAI (nome, email, telefone, formacao, experiencias, etc.)
        const extractionPrompt = `Extraia os seguintes dados do currículo:
- nome: Nome completo do candidato
- email: E-mail de contato ou null
- telefones_celulares: Lista de números de telefone celular com DDD (apenas celulares BR, 11 dígitos, ex: 11999999999)
- endereco: Endereço completo ou cidade/estado
- experiencia_profissional: Lista com experiências profissionais resumidas
- formacao_academica: Lista com formação acadêmica/cursos
- skills: Lista de habilidades principais

Currículo:
${extractedText.substring(0, 15000)}

Retorne ESTRITAMENTE um JSON com as chaves:
{
  "nome": "string",
  "email": "string ou null",
  "telefones_celulares": ["string"],
  "endereco": "string ou null",
  "experiencia_profissional": ["string"],
  "formacao_academica": ["string"],
  "skills": ["string"]
}`

        const extractedData = await callOpenAIWithRetry(extractionPrompt)

        const candidateName = (extractedData.nome || '').trim() || 'Candidato Desconhecido'
        const candidateEmail = extractedData.email
          ? String(extractedData.email).trim().toLowerCase()
          : null

        let telefonesArr: string[] = []
        if (Array.isArray(extractedData.telefones_celulares)) {
          telefonesArr = extractedData.telefones_celulares
        } else if (extractedData.telefone) {
          telefonesArr = [extractedData.telefone]
        }

        const rawTelefone = telefonesArr.join(',')
        let finalTelefone: string | null = null
        let telefoneNormalizado: string | null = null

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
            .filter(Boolean) as string[]
          const uniqueParts = Array.from(new Set(normalizedParts))
          finalTelefone = uniqueParts.length > 0 ? uniqueParts.join(',') : rawTelefone
          telefoneNormalizado =
            uniqueParts.length > 0 ? uniqueParts[0] : normalizePhone(rawTelefone)
        }

        // e. Pular se o candidato já existir (verificar por email + nome)
        if (candidateEmail) {
          const { data: existingByEmail } = await supabaseAdmin
            .from('candidatos')
            .select('id')
            .eq('email', candidateEmail)
            .limit(1)

          if (existingByEmail && existingByEmail.length > 0) {
            console.log(`Candidato já existe por email (${candidateEmail}). Pulando...`)
            results.pulados_existentes++
            return
          }
        }

        if (candidateName && candidateName !== 'Candidato Desconhecido') {
          const { data: existingByName } = await supabaseAdmin
            .from('candidatos')
            .select('id')
            .ilike('nome', candidateName)
            .limit(1)

          if (existingByName && existingByName.length > 0) {
            console.log(`Candidato já existe por nome (${candidateName}). Pulando...`)
            results.pulados_existentes++
            return
          }
        }

        // URL pública no bucket curriculos
        const publicUrl = `${supabaseUrl}/storage/v1/object/public/curriculos/${filePath}`

        // d. Inserir em candidatos
        const candidatePayload = {
          nome: candidateName,
          email: candidateEmail,
          telefone: finalTelefone,
          telefone_normalizado: telefoneNormalizado,
          fonte: 'recuperacao_storage',
          curriculo_url: publicUrl,
          dados_extraidos: extractedData,
          user_id: effectiveUserId,
          etapa_id: triagemEtapaId,
          vaga_id: null as string | null,
          criado_em: new Date().toISOString(),
        }

        const { data: insertedCandidate, error: insertError } = await supabaseAdmin
          .from('candidatos')
          .insert(candidatePayload)
          .select('id')
          .single()

        if (insertError || !insertedCandidate) {
          throw new Error(`Erro ao inserir candidato no banco: ${insertError?.message}`)
        }

        const candidateId = insertedCandidate.id

        // Registrar em candidato_etapa se tiver etapa
        if (triagemEtapaId) {
          await supabaseAdmin.from('candidato_etapa').insert({
            candidato_id: candidateId,
            etapa_id: triagemEtapaId,
            usuario_id: effectiveUserId,
          })
        }

        // c. Chamar identify-vaga-from-cv para encontrar a vaga compatível
        let matchedVagaId: string | null = null
        try {
          const identifyRes = await supabaseAdmin.functions.invoke('identify-vaga-from-cv', {
            body: { candidato_id: candidateId, user_id: effectiveUserId },
          })
          if (identifyRes.data?.vaga_id) {
            matchedVagaId = identifyRes.data.vaga_id
            await supabaseAdmin
              .from('candidatos')
              .update({ vaga_id: matchedVagaId })
              .eq('id', candidateId)
          }
        } catch (vagaErr) {
          console.error(`Erro ao identificar vaga para candidato ${candidateId}:`, vagaErr)
        }

        // Executar critérios de análise se identificou vaga
        if (matchedVagaId) {
          try {
            await supabaseAdmin.functions.invoke('analisar-cv-criterios', {
              body: { cv_id: candidateId, vaga_id: matchedVagaId, user_id: effectiveUserId },
            })
          } catch (critErr) {
            console.error(`Erro ao analisar critérios para candidato ${candidateId}:`, critErr)
          }
        }

        results.sucesso++
        console.log(`Candidato ${candidateName} recuperado com sucesso (${filePath})!`)
      } catch (err: any) {
        console.error(`Falha no arquivo ${filePath}:`, err.message)
        results.falhas++
        results.detalhes_falhas.push({
          path: filePath,
          motivo: err.message || 'Erro desconhecido',
        })
      }
    }

    // 4. Processar em lotes de 5 para não sobrecarregar a OpenAI
    const BATCH_SIZE = 5
    for (let i = 0; i < allPdfPaths.length; i += BATCH_SIZE) {
      const batch = allPdfPaths.slice(i, i + BATCH_SIZE)
      console.log(
        `Processando lote ${Math.floor(i / BATCH_SIZE) + 1} de ${Math.ceil(allPdfPaths.length / BATCH_SIZE)} (itens ${i + 1} a ${Math.min(i + BATCH_SIZE, allPdfPaths.length)})...`,
      )
      await Promise.all(batch.map((path) => processSinglePdf(path)))
    }

    results.tempo_total_segundos = Math.round((Date.now() - startTime) / 1000)

    console.log('Recuperação concluída:', results)

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

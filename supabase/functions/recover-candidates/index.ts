import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Helper para extrair e sanitizar um nome provisório a partir do caminho do arquivo
function deriveCandidateName(filePath: string): string {
  // Pega apenas a última parte do caminho (filename)
  const segments = filePath.split('/')
  const filename = segments[segments.length - 1] || 'Candidato'

  // Remove a extensão (.pdf, etc)
  let cleanName = filename.replace(/\.[^/.]+$/, '')

  // Decodifica URI se houver caracteres codificados (%20, etc)
  try {
    cleanName = decodeURIComponent(cleanName)
  } catch {
    // se falhar decode, continua com o valor bruto
  }

  // Substitui separadores comuns (_, -, +) por espaços
  cleanName = cleanName.replace(/[_\-+]/g, ' ')

  // Remove múltiplos espaços e faz trim
  cleanName = cleanName.replace(/\s+/g, ' ').trim()

  // Se o nome ficou vazio ou apenas números/hashes sem sentido, dá um fallback legível
  if (!cleanName || cleanName.length < 2) {
    return 'Candidato (Storage)'
  }

  return cleanName
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

    // 1. Obter User ID do TI (ti@viasudeste.com) com fallback para primeiro admin/usuário
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
        JSON.stringify({ error: 'Nenhum usuário responsável encontrado (ti@viasudeste.com).' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 2. Obter Etapa ID da Triagem com fallback para a primeira etapa por ordem
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
      detalhes_falhas: [] as { arquivo: string; erro: string; path?: string; motivo?: string }[],
      tempo_total_segundos: 0,
    }

    // Função de processamento individual de um PDF sem dependências Node.js
    const processSinglePdf = async (filePath: string) => {
      try {
        const publicUrl = `${supabaseUrl}/storage/v1/object/public/curriculos/${filePath}`

        // Verificar se já existe candidato com este curriculo_url exato ou contendo o caminho
        const { data: existingCandidate } = await supabaseAdmin
          .from('candidatos')
          .select('id')
          .or(`curriculo_url.eq."${publicUrl}",curriculo_url.ilike."%${filePath}%"`)
          .limit(1)
          .maybeSingle()

        if (existingCandidate) {
          console.log(`Candidato já cadastrado para ${filePath}. Pulando...`)
          results.pulados_existentes++
          return
        }

        // a. Derivar nome provisório
        const provisionalName = deriveCandidateName(filePath)

        // c. Inserir registro MÍNIMO em candidatos
        const candidatePayload = {
          nome: provisionalName,
          curriculo_url: publicUrl,
          user_id: effectiveUserId,
          etapa_id: triagemEtapaId,
          fonte: 'recuperacao_storage',
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

        // d. Inserir em candidato_etapa com etapa Triagem
        if (triagemEtapaId) {
          const { error: etapaRelError } = await supabaseAdmin.from('candidato_etapa').insert({
            candidato_id: candidateId,
            etapa_id: triagemEtapaId,
            usuario_id: effectiveUserId,
          })

          if (etapaRelError) {
            console.warn(
              `Aviso ao inserir candidato_etapa para ${candidateId}:`,
              etapaRelError.message,
            )
          }
        }

        // e. Chamar supabaseAdmin.functions.invoke('reanalisar-candidato')
        // A edge function 'reanalisar-candidato' faz o trabalho completo:
        // identificar vaga, baixar/ler PDF, chamar OpenAI, analisar critérios
        try {
          const { data: reanaliseData, error: reanaliseError } =
            await supabaseAdmin.functions.invoke('reanalisar-candidato', {
              body: { candidate_id: candidateId },
            })

          if (reanaliseError) {
            console.warn(`Aviso na reanálise do candidato ${candidateId}:`, reanaliseError.message)
          } else if (reanaliseData?.error) {
            console.warn(`Aviso retornado pela reanálise para ${candidateId}:`, reanaliseData.error)
          }
        } catch (invokeErr: any) {
          console.warn(
            `Exceção ao invocar reanalisar-candidato para ${candidateId}:`,
            invokeErr?.message,
          )
        }

        results.sucesso++
        console.log(`Candidato "${provisionalName}" recuperado com sucesso (${filePath})!`)
      } catch (err: any) {
        console.error(`Falha no arquivo ${filePath}:`, err.message)
        results.falhas++
        results.detalhes_falhas.push({
          arquivo: filePath,
          erro: err.message || 'Erro desconhecido',
          path: filePath,
          motivo: err.message || 'Erro desconhecido',
        })
      }
    }

    // 4. Processar em lotes de 5 com Promise.all
    const BATCH_SIZE = 5
    for (let i = 0; i < allPdfPaths.length; i += BATCH_SIZE) {
      const batch = allPdfPaths.slice(i, i + BATCH_SIZE)
      console.log(
        `Processando lote ${Math.floor(i / BATCH_SIZE) + 1} de ${Math.ceil(allPdfPaths.length / BATCH_SIZE)} (itens ${i + 1} a ${Math.min(i + BATCH_SIZE, allPdfPaths.length)})...`,
      )
      await Promise.all(batch.map((filePath) => processSinglePdf(filePath)))
    }

    results.tempo_total_segundos = Math.round(((Date.now() - startTime) / 1000) * 10) / 10

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

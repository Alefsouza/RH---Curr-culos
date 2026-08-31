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

interface ExtractedCandidateData {
  nome: string | null
  email: string | null
  telefones_celulares?: string[]
  telefone?: string | null
  endereco?: string | null
  resumo_cv?: string | null
  experiencia_profissional?: string[] | string
  skills?: string[] | string
  formacao_academica?: string[] | string
  [key: string]: any
}

// Extrai dados do currículo via OpenAI (apenas texto puro, sem image_url)
async function extractCandidateData(
  openai: OpenAI,
  fileBytes: Uint8Array,
  fileName: string,
): Promise<{ extractedData: ExtractedCandidateData; rawText: string } | null> {
  const ext = fileName.toLowerCase().split('.').pop()
  let extractedRawText = ''

  if (ext === 'docx') {
    extractedRawText = await extractRawTextFromDocxBytes(fileBytes)
  } else {
    extractedRawText = await extractTextFromPdfBytes(fileBytes)
  }

  // Se o texto extraído for vazio ou muito curto (< 50 caracteres), arquivo escaneado/imagem/sem texto legível
  if (!extractedRawText || extractedRawText.trim().length < 50) {
    console.warn(
      `[extractCandidateData] Arquivo ${fileName} não possui texto legível suficiente (${extractedRawText?.trim().length || 0} caracteres). PDF escaneado ou sem texto.`,
    )
    return null
  }

  const systemPrompt =
    'Você é um especialista em RH e análise de currículos. Extraia com precisão os dados cadastrais e profissionais do documento enviado em português brasileiro. Preserve rigorosamente todos os acentos e caracteres especiais da língua portuguesa (ç, ã, õ, â, ê, ô, á, é, í, ó, ú, etc.). NUNCA invente dados como "Candidato Desconhecido", "Nome Completo Exemplo", "João da Silva", emails de exemplo ou telefones falsos. Se não conseguir ler o nome do candidato real no currículo, retorne null. NUNCA duplique palavras no nome (ex: "Lucas Lucas"). Responda ESTRITAMENTE em JSON válido.'

  const promptText = `Analise o currículo (arquivo: ${fileName}) e extraia todos os dados estruturados.
Extraia com cuidado preservando a grafia correta com acentos em português:
- nome: Nome completo REAL extraído do currículo, ou null se não identificado
- email: Endereço de e-mail REAL válido, ou null se não identificado
- telefones_celulares: Lista de telefones celulares brasileiros REAIS com DDD (ex: ["11987654321"]) ou [] se nenhum
- telefone: Telefone celular principal ou null se não identificado
- endereco: Cidade, estado ou endereço completo, ou null se não identificado
- resumo_cv: Resumo das qualificações e perfil profissional, ou null se não identificado
- experiencia_profissional: Lista de experiências anteriores com cargos e empresas, ou [] se não houver
- skills: Lista de habilidades técnicas e competências, ou [] se não houver
- formacao_academica: Lista de formações acadêmicas e cursos, ou [] se não houver

IMPORTANTE:
1. NUNCA invente dados ou placeholders como "Candidato Desconhecido", "João da Silva", "11999999999", "exemplo@email.com". Se não constar, use null ou [].
2. NUNCA retorne o texto literal "string ou null", "string", ou "null". Use o valor JSON null real quando o dado não existir.
3. Não duplique nomes (evite "Lucas Lucas" ou repetições).

Formato JSON estrito esperado:
{
  "nome": null,
  "email": null,
  "telefones_celulares": [],
  "telefone": null,
  "endereco": null,
  "resumo_cv": null,
  "experiencia_profissional": [],
  "skills": [],
  "formacao_academica": []
}`

  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `${promptText}\n\nTexto extraído do currículo:\n${extractedRawText.substring(0, 20000)}`,
    },
  ]

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
    msgs: any[],
    retries = 3,
    delays = [2000, 4000, 8000],
  ): Promise<any> => {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: msgs,
        response_format: { type: 'json_object' },
      })
      return JSON.parse(response.choices[0].message.content || '{}')
    } catch (error: any) {
      if (retries > 0 && isRetryableError(error)) {
        const delay = delays[3 - retries] ?? 8000
        console.log(`OpenAI retry em ${delay}ms... (${retries} restantes)`)
        await new Promise((res) => setTimeout(res, delay))
        return callOpenAIWithRetry(msgs, retries - 1, delays)
      }
      throw error
    }
  }

  const parsedJson: ExtractedCandidateData = await callOpenAIWithRetry(messages)

  const rawTextToMatch = [
    parsedJson.resumo_cv || '',
    Array.isArray(parsedJson.experiencia_profissional)
      ? parsedJson.experiencia_profissional.join('\n')
      : parsedJson.experiencia_profissional || '',
    Array.isArray(parsedJson.skills) ? parsedJson.skills.join(', ') : parsedJson.skills || '',
    Array.isArray(parsedJson.formacao_academica)
      ? parsedJson.formacao_academica.join('\n')
      : parsedJson.formacao_academica || '',
    extractedRawText,
  ]
    .filter(Boolean)
    .join('\n\n')

  return {
    extractedData: parsedJson,
    rawText: rawTextToMatch || extractedRawText,
  }
}

// Interface para mensagens do Microsoft Graph
interface GraphMessage {
  id: string
  subject?: string
  from?: { emailAddress?: { address?: string; name?: string } }
  receivedDateTime?: string
  hasAttachments?: boolean
  conversationId?: string
  isRead?: boolean
  parentFolderId?: string
}

// Busca recursiva de todas as pastas de e-mail no Microsoft Graph
async function getAllMailFolderIds(
  mailboxEmail: string,
  graphHeaders: Record<string, string>,
  folderId?: string,
): Promise<{ id: string; displayName: string }[]> {
  const folders: { id: string; displayName: string }[] = []
  const url = folderId
    ? `https://graph.microsoft.com/v1.0/users/${mailboxEmail}/mailFolders/${folderId}/childFolders?$top=100`
    : `https://graph.microsoft.com/v1.0/users/${mailboxEmail}/mailFolders?$top=100`

  try {
    const res = await fetch(url, { headers: graphHeaders })
    if (!res.ok) {
      console.warn(`Aviso ao listar pastas (${folderId || 'root'}): ${res.status}`)
      return folders
    }

    const data = await res.json()
    const folderList = data.value || []

    for (const f of folderList) {
      // Ignorar lixeira (Deleted Items), spam (Junk Email), rascunhos (Drafts), itens enviados (Sent Items)
      const folderName = (f.displayName || '').toLowerCase()
      const wellKnown = (f.wellKnownName || '').toLowerCase()
      if (
        folderName.includes('deleted') ||
        folderName.includes('junk') ||
        folderName.includes('drafts') ||
        folderName.includes('sent') ||
        folderName.includes('lixo') ||
        folderName.includes('exclu') ||
        folderName.includes('spam') ||
        wellKnown === 'deleteditems' ||
        wellKnown === 'junkemail' ||
        wellKnown === 'drafts' ||
        wellKnown === 'sentitems'
      ) {
        continue
      }

      folders.push({ id: f.id, displayName: f.displayName })

      // Se tiver subpastas, busca recursivamente
      if (f.childFolderCount && f.childFolderCount > 0) {
        const subFolders = await getAllMailFolderIds(mailboxEmail, graphHeaders, f.id)
        folders.push(...subFolders)
      }
    }
  } catch (err: any) {
    console.error('Erro ao buscar pastas recursivamente:', err?.message)
  }

  return folders
}

// Busca mensagens em uma pasta específica
async function getMessagesFromFolder(
  mailboxEmail: string,
  folderId: string,
  graphHeaders: Record<string, string>,
  top = 50,
): Promise<GraphMessage[]> {
  try {
    const url = `https://graph.microsoft.com/v1.0/users/${mailboxEmail}/mailFolders/${folderId}/messages?$top=${top}&$orderby=receivedDateTime desc&$select=id,subject,from,receivedDateTime,hasAttachments,conversationId,isRead`
    const res = await fetch(url, { headers: graphHeaders })
    if (!res.ok) {
      console.warn(`Erro ao buscar mensagens na pasta ${folderId}: ${res.status}`)
      return []
    }
    const data = await res.json()
    return data.value || []
  } catch (err: any) {
    console.error(`Falha ao buscar mensagens na pasta ${folderId}:`, err?.message)
    return []
  }
}

// Execução da sincronização completa
async function performSync(supabase: any, syncRunId: string | null, userId: string) {
  const errors: any[] = []
  let emailsScanned = 0
  let cvsImported = 0
  let cvsSkippedNoMatch = 0
  let cvsSkippedDuplicate = 0
  let cvsSkippedInternal = 0

  try {
    const clientId = Deno.env.get('MS_CLIENT_ID')
    const clientSecret = Deno.env.get('MS_CLIENT_SECRET')
    const tenantId = Deno.env.get('MS_TENANT_ID')
    const mailboxEmail = Deno.env.get('MAILBOX_EMAIL') || 'rh@viasudeste.com'
    const openaiKey = Deno.env.get('OPENAI_KEY') || Deno.env.get('OPENIA_KEY')

    if (!clientId || !clientSecret || !tenantId) {
      throw new Error(
        'Credenciais Microsoft não configuradas (MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT_ID).',
      )
    }

    if (!openaiKey) {
      throw new Error('Chave OpenAI não configurada.')
    }

    const openai = new OpenAI({ apiKey: openaiKey })

    // 1. Obter token de acesso do Microsoft Graph via client credentials flow
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'client_credentials',
          scope: 'https://graph.microsoft.com/.default',
        }),
      },
    )

    if (!tokenRes.ok) {
      const errText = await tokenRes.text()
      throw new Error(`Falha ao obter token Microsoft Graph: ${tokenRes.status} ${errText}`)
    }

    const tokenJson = await tokenRes.json()
    const accessToken = tokenJson.access_token
    if (!accessToken) {
      throw new Error('Access Token não retornado pelo Microsoft Graph.')
    }

    const graphHeaders = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }

    // 2. Buscar todas as pastas recursivamente (MUDANÇA 1: TODAS as pastas do Outlook)
    console.log(`Outlook Sync: Listando todas as pastas da caixa ${mailboxEmail}...`)
    const folders = await getAllMailFolderIds(mailboxEmail, graphHeaders)

    // Garantir que a inbox esteja inclusa caso folders retorne vazio
    if (folders.length === 0) {
      folders.push({ id: 'inbox', displayName: 'Caixa de Entrada' })
    }

    console.log(
      `Outlook Sync: Encontradas ${folders.length} pastas para verificação:`,
      folders.map((f) => f.displayName),
    )

    // Coletar mensagens de todas as pastas, evitando duplicatas de id
    const messageMap = new Map<string, GraphMessage>()

    for (const folder of folders) {
      const msgs = await getMessagesFromFolder(mailboxEmail, folder.id, graphHeaders, 50)
      for (const m of msgs) {
        if (!messageMap.has(m.id)) {
          messageMap.set(m.id, m)
        }
      }
    }

    const messages = Array.from(messageMap.values())
    emailsScanned = messages.length

    console.log(
      `Outlook Sync: Total de ${messages.length} e-mails únicos coletados em todas as pastas da caixa ${mailboxEmail}`,
    )

    const replyPrefixes = /^(re:|fwd:|res:|enc:)/i

    for (const msg of messages) {
      const subject = msg.subject || ''
      const senderEmail = msg.from?.emailAddress?.address || ''
      const senderDomain = senderEmail.split('@')[1]?.toLowerCase() || ''

      // MUDANÇA 1: REMOVER o filtro rígido de assunto! Aceitar todos os assuntos com anexo.
      // Apenas ignorar e-mails sem anexo ou respostas triviais sem anexo
      if (!msg.hasAttachments) {
        cvsSkippedNoMatch++
        continue
      }

      // Ignora remetentes internos da empresa exceto envio@viasudeste.com
      if (
        senderDomain === 'viasudeste.com' &&
        senderEmail.toLowerCase() !== 'envio@viasudeste.com'
      ) {
        cvsSkippedInternal++
        continue
      }

      // Checa duplicidade de importação já processada com sucesso
      const { data: existing } = await supabase
        .from('email_importacoes')
        .select('id, status')
        .eq('outlook_message_id', msg.id)
        .maybeSingle()

      if (existing && existing.status !== 'erro' && existing.status !== 'sem_anexo_valido') {
        cvsSkippedDuplicate++
        continue
      }

      // Buscar detalhes da mensagem com anexos
      // Se houver anexo grande (>3MB), Microsoft Graph $expand=attachments retorna anexo normal ou @odata.type = #microsoft.graph.fileAttachment
      let msgRes = await fetch(
        `https://graph.microsoft.com/v1.0/users/${mailboxEmail}/messages/${msg.id}?$expand=attachments`,
        { headers: graphHeaders },
      )

      if (!msgRes.ok) {
        console.error(`Erro ao obter detalhes do e-mail ${msg.id}: ${msgRes.status}`)
        continue
      }

      const msgDetail = await msgRes.json()
      let attachments = msgDetail.attachments || []

      // Se attachments vier vazio mas msg.hasAttachments é true, tenta listar endpoint direto /attachments
      if (attachments.length === 0) {
        try {
          const attRes = await fetch(
            `https://graph.microsoft.com/v1.0/users/${mailboxEmail}/messages/${msg.id}/attachments`,
            { headers: graphHeaders },
          )
          if (attRes.ok) {
            const attData = await attRes.json()
            attachments = attData.value || []
          }
        } catch (e: any) {
          console.warn(`Erro ao listar attachments do msg ${msg.id}:`, e?.message)
        }
      }

      // Priorizar PDF e DOCX
      let selectedAtt = attachments.find((a: any) => {
        const n = (a.name || '').toLowerCase()
        return n.endsWith('.pdf')
      })

      if (!selectedAtt) {
        selectedAtt = attachments.find((a: any) => {
          const n = (a.name || '').toLowerCase()
          return n.endsWith('.docx')
        })
      }

      const importBase: any = {
        outlook_message_id: msg.id,
        outlook_thread_id: msg.conversationId,
        remetente: senderEmail,
        assunto: subject,
        recebido_em: msg.receivedDateTime,
        user_id: userId,
      }

      if (!selectedAtt) {
        cvsSkippedNoMatch++
        const noAttPayload = {
          ...importBase,
          status: 'sem_anexo_valido',
          erro_detalhes: 'Nenhum anexo PDF ou DOCX encontrado.',
          processado_em: new Date().toISOString(),
        }
        if (existing?.id) {
          await supabase.from('email_importacoes').update(noAttPayload).eq('id', existing.id)
        } else {
          await supabase.from('email_importacoes').insert(noAttPayload)
        }
        continue
      }

      // Se o anexo não veio com contentBytes direto (ex: anexo grande >3MB no Graph), buscar /attachments/{id}/$value
      let fileBytes: Uint8Array | null = null
      const fileName = selectedAtt.name || 'curriculo.pdf'
      const ext = fileName.toLowerCase().split('.').pop() || 'pdf'

      try {
        if (selectedAtt.contentBytes) {
          const binaryString = atob(selectedAtt.contentBytes)
          fileBytes = new Uint8Array(binaryString.length)
          for (let i = 0; i < binaryString.length; i++) {
            fileBytes[i] = binaryString.charCodeAt(i)
          }
        } else if (selectedAtt.id) {
          // Download direto do stream do anexo grande
          const attRawRes = await fetch(
            `https://graph.microsoft.com/v1.0/users/${mailboxEmail}/messages/${msg.id}/attachments/${selectedAtt.id}/$value`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          )
          if (attRawRes.ok) {
            const buf = await attRawRes.arrayBuffer()
            fileBytes = new Uint8Array(buf)
          }
        }

        if (!fileBytes || fileBytes.length === 0) {
          throw new Error('Não foi possível obter os bytes do anexo.')
        }

        // MUDANÇA 1: Aumentar limite para aceitar arquivos maiores que 10MB (ex.: até 50MB)
        if (fileBytes.byteLength > 50 * 1024 * 1024) {
          throw new Error('Tamanho do arquivo excede o limite suportado de 50MB.')
        }

        // Extrair dados do candidato via OpenAI
        console.log(
          `Outlook Sync: Extraindo dados de ${fileName} (${(fileBytes.byteLength / 1024 / 1024).toFixed(2)} MB)...`,
        )
        const extractionResult = await extractCandidateData(openai, fileBytes, fileName)

        if (!extractionResult) {
          console.warn(
            `Outlook Sync: Arquivo ${fileName} não pôde ser lido (texto < 50 caracteres / escaneado). Marcando como não processado e continuando.`,
          )
          cvsSkippedNoMatch++
          const unprocessablePayload = {
            ...importBase,
            status: 'texto_insuficiente',
            erro_detalhes:
              'Arquivo não contém texto legível suficiente (< 50 caracteres ou documento escaneado/imagem).',
            anexo_filename: fileName,
            processado_em: new Date().toISOString(),
          }
          if (existing?.id) {
            await supabase
              .from('email_importacoes')
              .update(unprocessablePayload)
              .eq('id', existing.id)
          } else {
            await supabase.from('email_importacoes').insert(unprocessablePayload)
          }
          continue
        }

        const { extractedData, rawText } = extractionResult

        // MUDANÇA 2: Validações rigorosas de nome e email
        const cleanCandidateName = sanitizeAndValidateName(extractedData.nome)
        const cleanCandidateEmail = sanitizeAndValidateEmail(extractedData.email)

        // Se o nome for nulo ou inválido, NÃO inserir candidato com nome inventado
        if (!cleanCandidateName) {
          console.log(
            `Outlook Sync: Nome inválido ou ausente no currículo ${fileName}. Candidato ignorado para evitar placeholders.`,
          )
          cvsSkippedNoMatch++
          const invalidPayload = {
            ...importBase,
            status: 'nome_invalido',
            erro_detalhes: 'Nome não identificado com segurança no documento.',
            anexo_filename: fileName,
            processado_em: new Date().toISOString(),
          }
          if (existing?.id) {
            await supabase.from('email_importacoes').update(invalidPayload).eq('id', existing.id)
          } else {
            await supabase.from('email_importacoes').insert(invalidPayload)
          }
          continue
        }

        const finalNome = cleanCandidateName
        const finalEmail = cleanCandidateEmail

        // Normalização e validação de telefone
        let telefonesArr: string[] = []
        if (Array.isArray(extractedData.telefones_celulares)) {
          telefonesArr = extractedData.telefones_celulares
        } else if (extractedData.telefone) {
          telefonesArr = [extractedData.telefone]
        }

        const rawTelefone = telefonesArr.length > 0 ? telefonesArr.join(',') : null
        let normalizedTelefone: string | null = null
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

        // Checagem de duplicação do candidato
        const orConds = []
        if (cleanCandidateName) {
          orConds.push(`nome.eq."${cleanCandidateName.replace(/"/g, '')}"`)
        }
        if (finalEmail) {
          orConds.push(`email.eq."${finalEmail.replace(/"/g, '')}"`)
        }

        let candidatoId: string | null = null
        let isDuplicate = false

        if (orConds.length > 0) {
          const { data: dups } = await supabase
            .from('candidatos')
            .select('id')
            .eq('user_id', userId)
            .or(orConds.join(','))
            .limit(1)

          if (dups && dups.length > 0) {
            candidatoId = dups[0].id
            isDuplicate = true
            await supabase
              .from('candidatos')
              .update({
                nome: finalNome,
                email: finalEmail,
                telefone: normalizedTelefone,
                dados_extraidos: extractedData,
              })
              .eq('id', candidatoId)
            cvsSkippedDuplicate++
          }
        }

        if (!candidatoId) {
          const { data: newCand, error: candError } = await supabase
            .from('candidatos')
            .insert({
              nome: finalNome,
              email: finalEmail,
              telefone: normalizedTelefone,
              dados_extraidos: extractedData,
              fonte: 'outlook_import',
              user_id: userId,
            })
            .select('id')
            .single()

          if (candError || !newCand) {
            throw new Error(
              `Falha ao inserir candidato: ${candError?.message || 'Erro desconhecido'}`,
            )
          }
          candidatoId = newCand.id
        }

        // Upload do arquivo para o bucket 'curriculos'
        const now = new Date()
        const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
        const storagePath = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${candidatoId}/${sanitizedFileName}`
        const contentType =
          ext === 'docx'
            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : 'application/pdf'

        const { error: uploadError } = await supabase.storage
          .from('curriculos')
          .upload(storagePath, fileBytes, {
            contentType,
            upsert: true,
          })

        if (uploadError) {
          throw new Error(
            `Falha no upload do arquivo para o Storage (${storagePath}): ${uploadError.message}`,
          )
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from('curriculos').getPublicUrl(storagePath)

        await supabase.from('candidatos').update({ curriculo_url: publicUrl }).eq('id', candidatoId)

        // Atribuir etapa Triagem ao candidato
        let { data: etapa } = await supabase
          .from('etapas')
          .select('id')
          .eq('user_id', userId)
          .ilike('nome', 'Triagem')
          .maybeSingle()

        if (!etapa) {
          const { data: fallbackEtapa } = await supabase
            .from('etapas')
            .select('id')
            .eq('user_id', userId)
            .order('ordem', { ascending: true })
            .limit(1)
            .maybeSingle()
          etapa = fallbackEtapa
        }

        if (etapa) {
          await supabase.from('candidatos').update({ etapa_id: etapa.id }).eq('id', candidatoId)
          const { data: rel } = await supabase
            .from('candidato_etapa')
            .select('id')
            .eq('candidato_id', candidatoId)
            .eq('etapa_id', etapa.id)
            .maybeSingle()

          if (!rel) {
            await supabase
              .from('candidato_etapa')
              .insert({ candidato_id: candidatoId, etapa_id: etapa.id, usuario_id: userId })
          }
        }

        // Identificar vaga compatível
        let vagaId: string | null = null
        try {
          const identifyRes = await supabase.functions.invoke('identify-vaga-from-cv', {
            body: {
              candidato_id: candidatoId,
              user_id: userId,
              texto_cv: rawText,
              dados_extraidos: extractedData,
            },
          })
          vagaId = identifyRes.data?.vaga_id || null
        } catch (idErr: any) {
          console.warn('Erro ao identificar vaga:', idErr?.message)
        }

        let finalStatus = 'sucesso'
        if (vagaId) {
          await supabase.from('candidatos').update({ vaga_id: vagaId }).eq('id', candidatoId)

          try {
            const critRes = await supabase.functions.invoke('analisar-cv-criterios', {
              body: { cv_id: candidatoId, vaga_id: vagaId, user_id: userId },
            })
            if (critRes.data?.data?.analise?.resultado !== 'qualificado') {
              await supabase.from('candidatos').update({ etapa_id: null }).eq('id', candidatoId)
              finalStatus = 'nao_qualificado'
            }
          } catch (critErr: any) {
            console.warn('Erro na análise de critérios:', critErr?.message)
          }
        } else {
          await supabase
            .from('candidatos')
            .update({ vaga_id: null, etapa_id: null })
            .eq('id', candidatoId)
          finalStatus = 'sem_vaga_compativel'
        }

        // Registrar email_importacoes
        const importPayload = {
          ...importBase,
          status: finalStatus,
          candidato_id: candidatoId,
          vaga_id_identificada: vagaId || null,
          anexo_filename: fileName,
          anexo_storage_path: storagePath,
          processado_em: new Date().toISOString(),
        }

        if (existing?.id) {
          await supabase.from('email_importacoes').update(importPayload).eq('id', existing.id)
        } else {
          await supabase.from('email_importacoes').insert(importPayload)
        }

        // Marcar e-mail como lido no Microsoft Graph
        try {
          await fetch(`https://graph.microsoft.com/v1.0/users/${mailboxEmail}/messages/${msg.id}`, {
            method: 'PATCH',
            headers: graphHeaders,
            body: JSON.stringify({ isRead: true }),
          })
        } catch (patchErr: any) {
          console.warn(`Aviso ao marcar mensagem ${msg.id} como lida:`, patchErr?.message)
        }

        if (!isDuplicate) {
          cvsImported++
        }
      } catch (procError: any) {
        console.error(`Erro ao processar anexo do e-mail ${msg.id}:`, procError)
        errors.push({ messageId: msg.id, error: procError.message })

        const errPayload = {
          ...importBase,
          status: 'erro',
          erro_detalhes: procError.message,
          processado_em: new Date().toISOString(),
        }

        if (existing?.id) {
          await supabase.from('email_importacoes').update(errPayload).eq('id', existing.id)
        } else {
          await supabase.from('email_importacoes').insert(errPayload)
        }
      }
    }
  } catch (err: any) {
    console.error('Erro geral durante sincronização Outlook:', err)
    errors.push({ general: true, error: err.message })
  } finally {
    // Atualiza registro de sync_runs
    const hasGeneralError = errors.some((e: any) => e.general)
    let finalRunStatus = 'success'
    if (hasGeneralError) {
      finalRunStatus = 'error'
    } else if (errors.length > 0 && cvsImported > 0) {
      finalRunStatus = 'partial'
    } else if (errors.length > 0 && cvsImported === 0) {
      finalRunStatus = 'partial'
    } else {
      finalRunStatus = 'success'
    }

    if (syncRunId) {
      try {
        await supabase
          .from('sync_runs')
          .update({
            finished_at: new Date().toISOString(),
            status: finalRunStatus,
            emails_scanned: emailsScanned,
            cvs_imported: cvsImported,
            cvs_skipped_no_match: cvsSkippedNoMatch,
            cvs_skipped_duplicate: cvsSkippedDuplicate,
            cvs_skipped_internal: cvsSkippedInternal,
            errors: errors.length > 0 ? errors : null,
            last_synced_at: new Date().toISOString(),
          })
          .eq('id', syncRunId)
      } catch (updateErr: any) {
        console.error('Erro ao atualizar sync_runs no finally:', updateErr)
      }
    }

    console.log('Outlook Sync finalizado:', {
      syncRunId,
      status: finalRunStatus,
      emailsScanned,
      cvsImported,
      cvsSkippedDuplicate,
      cvsSkippedNoMatch,
      errorsCount: errors.length,
    })

    return {
      status: finalRunStatus,
      emails_scanned: emailsScanned,
      cvs_imported: cvsImported,
      cvs_skipped_duplicate: cvsSkippedDuplicate,
      cvs_skipped_no_match: cvsSkippedNoMatch,
      cvs_skipped_internal: cvsSkippedInternal,
      errors_count: errors.length,
      errors,
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Fallback de usuário administrador
    let { data: adminUser } = await supabase
      .from('usuarios')
      .select('id')
      .eq('email', 'financeiro@viasudeste.com')
      .maybeSingle()

    if (!adminUser) {
      const { data: fallbackUser } = await supabase
        .from('usuarios')
        .select('id')
        .eq('is_admin', true)
        .order('criado_em', { ascending: true })
        .limit(1)
        .maybeSingle()
      adminUser = fallbackUser
    }

    // Segundo fallback caso não haja is_admin = true
    if (!adminUser) {
      const { data: anyUser } = await supabase
        .from('usuarios')
        .select('id')
        .order('criado_em', { ascending: true })
        .limit(1)
        .maybeSingle()
      adminUser = anyUser
    }

    const userId = adminUser?.id
    if (!userId) {
      throw new Error('Nenhum usuário administrador encontrado no sistema.')
    }

    // Criar registro na tabela sync_runs
    const { data: syncRun } = await supabase
      .from('sync_runs')
      .insert({ status: 'running', started_at: new Date().toISOString() })
      .select('id')
      .single()

    const syncRunId = syncRun?.id || null

    const syncResult = await performSync(supabase, syncRunId, userId)

    return new Response(
      JSON.stringify({
        success: syncResult.status !== 'error',
        message: 'Sincronização do Outlook concluída.',
        sync_run_id: syncRunId,
        status: syncResult.status,
        emails_scanned: syncResult.emails_scanned,
        cvs_imported: syncResult.cvs_imported,
        cvs_skipped_duplicate: syncResult.cvs_skipped_duplicate,
        cvs_skipped_no_match: syncResult.cvs_skipped_no_match,
        cvs_skipped_internal: syncResult.cvs_skipped_internal,
        errors_count: syncResult.errors_count,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error: any) {
    console.error('Sync error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'
import { corsHeaders } from '../_shared/cors.ts'
import { normalizePhone } from '../_shared/phone.ts'

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

// Extrai texto legível de arquivo DOCX (XML bruto dentro do zip) sem bibliotecas externas
function extractRawTextFromDocxBytes(bytes: Uint8Array): string {
  try {
    const decoder = new TextDecoder('utf-8', { fatal: false })
    const content = decoder.decode(bytes)
    // Procura tags <w:t>...</w:t> ou <w:t xml:space="...">...</w:t> comuns em docx
    const textMatches = content.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gi)
    const chunks: string[] = []
    for (const match of textMatches) {
      if (match[1] && match[1].trim()) {
        chunks.push(match[1])
      }
    }
    if (chunks.length > 0) {
      return chunks.join(' ').replace(/\s+/g, ' ').trim()
    }
    // Fallback: remover todas as tags xml
    const stripped = content.replace(/<[^>]+>/g, ' ').replace(/[^\x20-\x7E\xC0-\xFF\n\r\t]/g, ' ')
    return stripped.replace(/\s+/g, ' ').trim()
  } catch {
    return ''
  }
}

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
    extractedRawText = extractRawTextFromDocxBytes(fileBytes)
  } else {
    extractedRawText = extractAsciiTextFromPdfBytes(fileBytes)
  }

  // Se o texto extraído for vazio ou muito curto (< 50 caracteres), arquivo escaneado/imagem/sem texto legível
  // NÃO enviar como imagem para a OpenAI (PDF não é imagem suportada e causa erro 400)
  if (!extractedRawText || extractedRawText.trim().length < 50) {
    console.warn(
      `[extractCandidateData] Arquivo ${fileName} não possui texto legível suficiente (${extractedRawText?.trim().length || 0} caracteres). PDF escaneado ou sem texto.`,
    )
    return null
  }

  const systemPrompt =
    'Você é um especialista em RH e análise de currículos. Extraia com precisão os dados cadastrais e profissionais do documento enviado em português brasileiro. Preserve rigorosamente todos os acentos e caracteres especiais da língua portuguesa (ç, ã, õ, â, ê, ô, á, é, í, ó, ú, etc.). NUNCA invente dados. Se não conseguir identificar um dado com certeza, retorne null ou array vazio. Responda ESTRITAMENTE em JSON válido.'

  const promptText = `Analise o currículo (arquivo: ${fileName}) e extraia todos os dados estruturados.
Extraia com cuidado preservando a grafia correta com acentos em português:
- nome: Nome completo extraído do currículo, ou null se não identificado
- email: Endereço de e-mail válido, ou null se não identificado
- telefones_celulares: Lista de telefones celulares brasileiros com DDD (ex: ["11999999999"]) ou [] se nenhum
- telefone: Telefone celular principal ou null se não identificado
- endereco: Cidade, estado ou endereço completo, ou null se não identificado
- resumo_cv: Resumo das qualificações e perfil profissional, ou null se não identificado
- experiencia_profissional: Lista de experiências anteriores com cargos e empresas, ou [] se não houver
- skills: Lista de habilidades técnicas e competências, ou [] se não houver
- formacao_academica: Lista de formações acadêmicas e cursos, ou [] se não houver

IMPORTANTE:
1. NUNCA invente dados. Se não conseguir ler ou o dado não constar, use null ou [].
2. NUNCA retorne o texto literal "string ou null", "string", ou "null". Use o valor JSON null real quando o dado não existir.

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

    // 2. Buscar e-mails não lidos ou recentes com anexos
    // Busca os 50 mais recentes da caixa de entrada
    const messagesRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${mailboxEmail}/mailFolders/inbox/messages?$top=50&$orderby=receivedDateTime desc&$select=id,subject,from,receivedDateTime,hasAttachments,conversationId,isRead`,
      { headers: graphHeaders },
    )

    if (!messagesRes.ok) {
      const errText = await messagesRes.text()
      throw new Error(`Falha ao buscar mensagens no Graph API: ${messagesRes.status} ${errText}`)
    }

    const messagesData = await messagesRes.json()
    const messages = messagesData.value || []
    emailsScanned = messages.length

    console.log(`Outlook Sync: ${messages.length} e-mails escaneados na caixa ${mailboxEmail}`)

    const subjectRegex =
      /(curr[ií]culo|curriculum|\bcv\b|vaga|candidatura|recrutamento|sele[cç][aã]o)/i
    const replyPrefixes = /^(re:|fwd:|res:|enc:)/i

    for (const msg of messages) {
      const subject = msg.subject || ''
      const senderEmail = msg.from?.emailAddress?.address || ''
      const senderDomain = senderEmail.split('@')[1]?.toLowerCase() || ''

      // Validação de assunto / anexos
      if (replyPrefixes.test(subject) || !subjectRegex.test(subject) || !msg.hasAttachments) {
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

      if (existing && existing.status !== 'erro') {
        cvsSkippedDuplicate++
        continue
      }

      // Buscar detalhes da mensagem com anexos
      const msgRes = await fetch(
        `https://graph.microsoft.com/v1.0/users/${mailboxEmail}/messages/${msg.id}?$expand=attachments`,
        { headers: graphHeaders },
      )

      if (!msgRes.ok) {
        console.error(`Erro ao obter detalhes do e-mail ${msg.id}: ${msgRes.status}`)
        continue
      }

      const msgDetail = await msgRes.json()
      const attachments = msgDetail.attachments || []

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

      if (!selectedAtt || !selectedAtt.contentBytes) {
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

      try {
        const base64Data = selectedAtt.contentBytes
        const fileName = selectedAtt.name || 'curriculo.pdf'
        const ext = fileName.toLowerCase().split('.').pop() || 'pdf'

        // Decodificar Base64 para Uint8Array usando Web APIs padrão (sem node:buffer)
        const binaryString = atob(base64Data)
        const fileBytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          fileBytes[i] = binaryString.charCodeAt(i)
        }

        // Limite de 10MB
        if (fileBytes.byteLength > 10 * 1024 * 1024) {
          throw new Error('Tamanho do arquivo excede o limite de 10MB.')
        }

        // Extrair dados do candidato via OpenAI
        console.log(`Outlook Sync: Extraindo dados de ${fileName} via OpenAI...`)
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

        const candidateName = extractedData.nome ? String(extractedData.nome).trim() : null
        const candidateEmail = extractedData.email ? String(extractedData.email).trim() : null

        const sanitizeValue = (val: string | null) => {
          if (!val) return null
          const trimmed = val.trim()
          const lower = trimmed.toLowerCase()
          if (
            lower === 'string ou null' ||
            lower === 'null' ||
            lower === 'undefined' ||
            lower === 'string' ||
            lower === 'none'
          ) {
            return null
          }
          return trimmed
        }

        const cleanCandidateName = sanitizeValue(candidateName)
        const cleanCandidateEmail = sanitizeValue(candidateEmail)

        if (!cleanCandidateName && !cleanCandidateEmail) {
          console.log(`Outlook Sync: Nome/Email não identificado no currículo ${fileName}.`)
          cvsSkippedNoMatch++
          continue
        }

        const finalNome = cleanCandidateName || 'Candidato Desconhecido'
        const finalEmail = cleanCandidateEmail || null

        // Normalização de telefone
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
          console.warn(`Aviso de upload do currículo ${storagePath}:`, uploadError.message)
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
    const finalRunStatus =
      errors.length > 0 && cvsImported > 0 ? 'partial' : errors.length > 0 ? 'error' : 'success'

    if (syncRunId) {
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

    // Processamento assíncrono em background via EdgeRuntime.waitUntil
    const isEdgeRuntime = typeof (globalThis as any).EdgeRuntime !== 'undefined'
    if (isEdgeRuntime && typeof (globalThis as any).EdgeRuntime.waitUntil === 'function') {
      ;(globalThis as any).EdgeRuntime.waitUntil(performSync(supabase, syncRunId, userId))
    } else {
      // Fallback para ambientes sem EdgeRuntime ou chamadas síncronas
      performSync(supabase, syncRunId, userId).catch((e) =>
        console.error('Background sync failed:', e),
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Sincronização do Outlook iniciada em segundo plano.',
        sync_run_id: syncRunId,
        status: 'running',
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

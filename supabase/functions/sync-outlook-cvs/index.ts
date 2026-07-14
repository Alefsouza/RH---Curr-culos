import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { Buffer } from 'node:buffer'
import pdf from 'npm:pdf-parse@1.1.1'
import mammoth from 'npm:mammoth@1.8.0'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: adminUser } = await supabase
      .from('usuarios')
      .select('id')
      .eq('email', 'financeiro@viasudeste.com')
      .maybeSingle()
    const userId = adminUser?.id
    if (!userId) throw new Error('Nenhum usuário administrador encontrado.')

    const { data: syncRun } = await supabase
      .from('sync_runs')
      .insert({ status: 'running', started_at: new Date().toISOString() })
      .select('id')
      .single()
    const syncRunId = syncRun?.id

    const clientId = Deno.env.get('MS_CLIENT_ID')
    const clientSecret = Deno.env.get('MS_CLIENT_SECRET')
    const tenantId = Deno.env.get('MS_TENANT_ID')
    const mailboxEmail = Deno.env.get('MAILBOX_EMAIL') || 'rh@viasudeste.com'
    if (!clientId || !clientSecret || !tenantId)
      throw new Error('Credenciais Microsoft não configuradas.')

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
    if (!tokenRes.ok) throw new Error('Falha ao obter token Microsoft Graph.')
    const accessToken = (await tokenRes.json()).access_token
    const graphHeaders = { Authorization: `Bearer ${accessToken}` }

    const messagesRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${mailboxEmail}/mailFolders/inbox/messages?$top=50&$orderby=receivedDateTime desc&$select=id,subject,from,receivedDateTime,hasAttachments,conversationId`,
      { headers: graphHeaders },
    )
    if (!messagesRes.ok) throw new Error('Falha ao buscar mensagens no Graph API.')
    const messages = (await messagesRes.json()).value || []

    let emailsScanned = messages.length,
      cvsImported = 0,
      cvsSkippedNoMatch = 0,
      cvsSkippedDuplicate = 0,
      cvsSkippedInternal = 0
    const errors: any[] = []
    const subjectRegex = /(curr[ií]culo|curriculum|\bcv\b)/i
    const replyPrefixes = /^(re:|fwd:|res:|enc:)/i

    for (const msg of messages) {
      const subject = msg.subject || ''
      const senderEmail = msg.from?.emailAddress?.address || ''
      const senderDomain = senderEmail.split('@')[1]?.toLowerCase() || ''

      if (replyPrefixes.test(subject) || !subjectRegex.test(subject) || !msg.hasAttachments) {
        cvsSkippedNoMatch++
        continue
      }
      if (
        senderDomain === 'viasudeste.com' &&
        senderEmail.toLowerCase() !== 'envio@viasudeste.com'
      ) {
        cvsSkippedInternal++
        continue
      }

      const { data: existing } = await supabase
        .from('email_importacoes')
        .select('id, status')
        .eq('outlook_message_id', msg.id)
        .maybeSingle()
      if (existing && existing.status !== 'erro') {
        cvsSkippedDuplicate++
        continue
      }

      const msgRes = await fetch(
        `https://graph.microsoft.com/v1.0/users/${mailboxEmail}/messages/${msg.id}?$expand=attachments`,
        { headers: graphHeaders },
      )
      const msgDetail = await msgRes.json()
      const attachments = msgDetail.attachments || []
      const selectedAtt = attachments.find((a: any) => {
        const n = (a.name || '').toLowerCase()
        return n.endsWith('.pdf') || n.endsWith('.docx')
      })

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
        if (existing?.id)
          await supabase
            .from('email_importacoes')
            .update({
              ...importBase,
              status: 'sem_anexo_valido',
              processado_em: new Date().toISOString(),
            })
            .eq('id', existing.id)
        else
          await supabase
            .from('email_importacoes')
            .insert({
              ...importBase,
              status: 'sem_anexo_valido',
              processado_em: new Date().toISOString(),
            })
        continue
      }

      try {
        const fileBuffer = Buffer.from(selectedAtt.contentBytes, 'base64')
        const fileName = selectedAtt.name || 'curriculo.pdf'
        const ext = fileName.toLowerCase().split('.').pop()
        let cvText = ''
        if (ext === 'pdf') {
          cvText = (await pdf(fileBuffer)).text
        } else if (ext === 'docx') {
          cvText = (await mammoth.extractRawText({ buffer: fileBuffer })).value
        }
        if (!cvText.trim()) {
          cvsSkippedNoMatch++
          continue
        }

        const openaiKey = Deno.env.get('OPENIA_KEY') || Deno.env.get('OPENAI_KEY')
        if (!openaiKey) throw new Error('OpenAI key not configured')

        const extractionRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'Extraia dados do currículo. Retorne JSON válido.' },
              {
                role: 'user',
                content: `Extraia: nome, email, telefones_celulares (array), endereco, experiencia_profissional (array), skills (array), formacao_academica (array). Retorne JSON.\n\n${cvText.substring(0, 15000)}`,
              },
            ],
            response_format: { type: 'json_object' },
          }),
        })
        const extracted = JSON.parse(
          (await extractionRes.json()).choices[0]?.message?.content || '{}',
        )
        if (!extracted.nome) {
          cvsSkippedNoMatch++
          continue
        }

        const orConds = [`nome.eq."${extracted.nome}"`]
        if (extracted.email) orConds.push(`email.eq."${extracted.email}"`)
        const { data: dups } = await supabase
          .from('candidatos')
          .select('id')
          .eq('user_id', userId)
          .or(orConds.join(','))

        let candidatoId: string | null = null
        if (dups && dups.length > 0) {
          candidatoId = dups[0].id
          await supabase
            .from('candidatos')
            .update({
              nome: extracted.nome,
              email: extracted.email || null,
              dados_extraidos: extracted,
            })
            .eq('id', candidatoId)
          cvsSkippedDuplicate++
        } else {
          const { data: newCand } = await supabase
            .from('candidatos')
            .insert({
              nome: extracted.nome,
              email: extracted.email || null,
              telefone: Array.isArray(extracted.telefones_celulares)
                ? extracted.telefones_celulares.join(',')
                : null,
              dados_extraidos: extracted,
              fonte: 'outlook_import',
              user_id: userId,
            })
            .select('id')
            .single()
          candidatoId = newCand?.id || null
        }
        if (!candidatoId) throw new Error('Falha ao criar candidato')

        const now = new Date()
        const storagePath = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${candidatoId}/${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`
        const contentType =
          ext === 'pdf'
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        await supabase.storage.from('curriculos').upload(storagePath, fileBuffer, { contentType })
        const {
          data: { publicUrl },
        } = supabase.storage.from('curriculos').getPublicUrl(storagePath)
        await supabase.from('candidatos').update({ curriculo_url: publicUrl }).eq('id', candidatoId)

        const { data: etapa } = await supabase
          .from('etapas')
          .select('id')
          .eq('user_id', userId)
          .ilike('nome', 'Novos')
          .maybeSingle()
        if (etapa) {
          await supabase.from('candidatos').update({ etapa_id: etapa.id }).eq('id', candidatoId)
          const { data: rel } = await supabase
            .from('candidato_etapa')
            .select('id')
            .eq('candidato_id', candidatoId)
            .eq('etapa_id', etapa.id)
            .maybeSingle()
          if (!rel)
            await supabase
              .from('candidato_etapa')
              .insert({ candidato_id: candidatoId, etapa_id: etapa.id, usuario_id: userId })
        }

        const identifyRes = await supabase.functions.invoke('identify-vaga-from-cv', {
          body: { candidato_id: candidatoId, user_id: userId },
        })
        const { vaga_id } = identifyRes.data || {}
        let finalStatus = 'sucesso'
        if (vaga_id) {
          await supabase.from('candidatos').update({ vaga_id }).eq('id', candidatoId)
          const critRes = await supabase.functions.invoke('analisar-cv-criterios', {
            body: { cv_id: candidatoId, vaga_id, user_id: userId },
          })
          if (critRes.data?.data?.analise?.resultado !== 'qualificado') {
            await supabase.from('candidatos').update({ etapa_id: null }).eq('id', candidatoId)
            finalStatus = 'nao_qualificado'
          }
        } else {
          await supabase
            .from('candidatos')
            .update({ vaga_id: null, etapa_id: null })
            .eq('id', candidatoId)
          finalStatus = 'sem_vaga_compativel'
        }

        const importPayload = {
          ...importBase,
          status: finalStatus,
          candidato_id: candidatoId,
          vaga_id_identificada: vaga_id || null,
          anexo_filename: fileName,
          anexo_storage_path: storagePath,
          processado_em: new Date().toISOString(),
        }
        if (existing?.id)
          await supabase.from('email_importacoes').update(importPayload).eq('id', existing.id)
        else await supabase.from('email_importacoes').insert(importPayload)
        cvsImported++
      } catch (procError: any) {
        errors.push({ messageId: msg.id, error: procError.message })
        const errPayload = {
          ...importBase,
          status: 'erro',
          erro_detalhes: procError.message,
          processado_em: new Date().toISOString(),
        }
        if (existing?.id)
          await supabase.from('email_importacoes').update(errPayload).eq('id', existing.id)
        else await supabase.from('email_importacoes').insert(errPayload)
      }
    }

    const finalStatus =
      errors.length > 0 && cvsImported > 0 ? 'partial' : errors.length > 0 ? 'error' : 'success'
    if (syncRunId) {
      await supabase
        .from('sync_runs')
        .update({
          finished_at: new Date().toISOString(),
          status: finalStatus,
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

    return new Response(
      JSON.stringify({
        success: true,
        emails_scanned: emailsScanned,
        cvs_imported: cvsImported,
        cvs_skipped_no_match: cvsSkippedNoMatch,
        cvs_skipped_duplicate: cvsSkippedDuplicate,
        cvs_skipped_internal: cvsSkippedInternal,
        errors,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('Sync error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

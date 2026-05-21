import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { Buffer } from 'node:buffer'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Discover the primary admin user to assign the resumes to
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
        .single()
      adminUser = fallbackUser
    }

    const userId = adminUser?.id
    if (!userId) {
      throw new Error('Nenhum usuário administrador encontrado para atribuir as importações do Gmail.')
    }

    const clientId = Deno.env.get('GMAIL_CLIENT_ID')
    const clientSecret = Deno.env.get('GMAIL_SECRET')
    const refreshToken = Deno.env.get('GMAIL_REFRESH')

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error('As credenciais da API do Gmail não estão devidamente configuradas nos Secrets (GMAIL_CLIENT_ID, GMAIL_SECRET, GMAIL_REFRESH).')
    }

    // Authenticate and get Access Token via Refresh Token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    if (!tokenRes.ok) {
      throw new Error('Falha de autorização com a API do Google.')
    }

    const tokenData = await tokenRes.json()
    const accessToken = tokenData.access_token

    if (!accessToken) {
      throw new Error('O Access Token não foi retornado pelo Google Auth.')
    }

    const headers = { Authorization: `Bearer ${accessToken}` }

    // Fetch or create the specific RH processing label
    let labelId = ''
    try {
      const labelsRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', { headers })
      if (labelsRes.ok) {
        const labelsData = await labelsRes.json()
        const targetLabel = 'Processado-RH-Sistema'
        const existingLabel = labelsData.labels?.find((l: any) => l.name === targetLabel)
        
        if (existingLabel) {
          labelId = existingLabel.id
        } else {
          const createRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: targetLabel,
              labelListVisibility: 'labelShow',
              messageListVisibility: 'show',
            }),
          })
          if (createRes.ok) {
            const createData = await createRes.json()
            labelId = createData.id
          }
        }
      }
    } catch (e) {
      console.error('Falha não-crítica ao buscar/criar label do Gmail:', e)
    }

    // Query for new incoming CV emails (Subject containing multiple keywords, With Attachment)
    const searchQuery = 'subject:(Curriculo OR CV OR Vaga OR Candidato) has:attachment newer_than:2d'
    const searchRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}`,
      { headers }
    )

    if (!searchRes.ok) {
      throw new Error('Falha ao buscar mensagens na caixa de entrada do Gmail.')
    }

    const searchData = await searchRes.json()
    const messages = searchData.messages || []
    const results = []

    console.log(`Encontradas ${messages.length} mensagens com a query: ${searchQuery}`)

    for (const msg of messages) {
      const msgId = msg.id

      // Check idempotency against our tracking table
      const { data: existingImport } = await supabase
        .from('email_importacoes')
        .select('id, status')
        .eq('gmail_message_id', msgId)
        .maybeSingle()

      // Skip already processed messages
      if (existingImport && existingImport.status !== 'erro') {
        console.log(`Mensagem ${msgId} pulada: Já importada (Status: ${existingImport.status})`)
        continue
      }

      // Fetch the full message detail
      const msgDetailRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}`,
        { headers }
      )
      const msgDetail = await msgDetailRes.json()

      // Additional protection: Check if label was manually applied on Gmail directly
      if (labelId && msgDetail.labelIds?.includes(labelId)) {
        console.log(`Mensagem ${msgId} pulada: Label processada já aplicada no Gmail`)
        continue
      }

      const msgHeaders = msgDetail.payload?.headers || []
      const fromHeader = msgHeaders.find((h: any) => h.name === 'From')?.value || ''
      const subjectHeader = msgHeaders.find((h: any) => h.name === 'Subject')?.value || ''
      const internalDateTimestamp = parseInt(msgDetail.internalDate)
      const internalDate = isNaN(internalDateTimestamp) ? new Date().toISOString() : new Date(internalDateTimestamp).toISOString()

      // Ensure record exists before heavy processing
      let importId = existingImport?.id
      if (!importId) {
        const { data: newImport } = await supabase
          .from('email_importacoes')
          .insert({
            gmail_message_id: msgId,
            gmail_thread_id: msgDetail.threadId,
            remetente: fromHeader,
            assunto: subjectHeader,
            recebido_em: internalDate,
            status: 'processando',
            user_id: userId,
          })
          .select('id')
          .single()
        importId = newImport?.id
      } else {
        await supabase
          .from('email_importacoes')
          .update({ status: 'processando', erro_detalhes: null })
          .eq('id', importId)
      }

      try {
        let attachmentId = null
        let filename = ''

        // Search in parts for the PDF attachment
        const parts = msgDetail.payload?.parts || []
        for (const part of parts) {
          if (part.filename && part.filename.toLowerCase().endsWith('.pdf')) {
            attachmentId = part.body?.attachmentId
            filename = part.filename
            break
          }
        }

        if (!attachmentId) {
          console.log(`Mensagem ${msgId} - Motivo do pulo: Nenhum anexo PDF válido encontrado`)
          await supabase
            .from('email_importacoes')
            .update({ status: 'sem_anexo_valido', erro_detalhes: 'Nenhum anexo PDF encontrado na mensagem', processado_em: new Date().toISOString() })
            .eq('id', importId)
          results.push({ msgId, status: 'sem_anexo_valido' })
          continue
        }

        console.log(`Mensagem ${msgId} - Processando anexo: ${filename}`)

        // Fetch attachment content
        const attRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/attachments/${attachmentId}`,
          { headers }
        )
        const attData = await attRes.json()

        if (!attData.data) {
          throw new Error('Dados do anexo vazios ou formato inesperado.')
        }

        // Decode base64url data to standard base64 then to Buffer
        const base64Data = attData.data.replace(/-/g, '+').replace(/_/g, '/')
        const pdfBuffer = Buffer.from(base64Data, 'base64')

        // Enforce 5MB limit
        if (pdfBuffer.length > 5 * 1024 * 1024) {
          await supabase
            .from('email_importacoes')
            .update({ status: 'erro', erro_detalhes: 'Tamanho do PDF excede o limite de 5MB', processado_em: new Date().toISOString() })
            .eq('id', importId)
          results.push({ msgId, status: 'erro_tamanho' })
          continue
        }

        // Upload to Supabase Storage
        const storagePath = `${userId}/gmail-${msgId}-${Date.now()}.pdf`
        const { error: uploadError } = await supabase.storage
          .from('curriculos')
          .upload(storagePath, pdfBuffer, { contentType: 'application/pdf' })

        if (uploadError) {
          throw uploadError
        }

        // Trigger existing analyze-resume Edge Function
        // Using "Candidato via Email" as placeholder, AI will overwrite with real name
        const analyzeRes = await supabase.functions.invoke('analyze-resume', {
          body: {
            filePath: storagePath,
            nome: 'Candidato via Email',
            email: fromHeader,
            telefone: '',
            vaga_id: null,
            user_id: userId,
          },
        })

        if (analyzeRes.error || !analyzeRes.data?.candidato_id) {
          throw new Error('Falha ao acionar a função de análise de IA: ' + JSON.stringify(analyzeRes.error || analyzeRes.data))
        }

        const candidatoId = analyzeRes.data.candidato_id

        // Attempt to find a suitable job match via OpenAI
        const identifyRes = await supabase.functions.invoke('identify-vaga-from-cv', {
          body: { candidato_id: candidatoId, user_id: userId },
        })

        const { vaga_id, confianca, justificativa } = identifyRes.data || {}
        let finalStatus = 'sucesso'

        // Decision Workflow
        if (vaga_id) {
          console.log(`Mensagem ${msgId} - Vaga compatível encontrada: ${vaga_id} (Confiança: ${confianca})`)
          // Update candidate with identified job
          await supabase.from('candidatos').update({ vaga_id }).eq('id', candidatoId)

          // Perform specific criteria validation for that job
          const critRes = await supabase.functions.invoke('analisar-cv-criterios', {
            body: { cv_id: candidatoId, vaga_id, user_id: userId },
          })

          const analise = critRes.data?.data?.analise

          if (analise?.resultado === 'qualificado') {
            console.log(`Mensagem ${msgId} - Candidato qualificado, inserindo no primeiro estágio do Kanban.`)
            // Re-assign explicitly to the first stage of Kanban
            const { data: etapa } = await supabase
              .from('etapas')
              .select('id')
              .eq('user_id', userId)
              .order('ordem', { ascending: true })
              .limit(1)
              .single()

            if (etapa) {
              await supabase.from('candidatos').update({ etapa_id: etapa.id }).eq('id', candidatoId)
              
              // Verify relationship idempotency before inserting
              const { data: relExists } = await supabase
                .from('candidato_etapa')
                .select('id')
                .eq('candidato_id', candidatoId)
                .eq('etapa_id', etapa.id)
                .maybeSingle()
                
              if (!relExists) {
                await supabase.from('candidato_etapa').insert({
                  candidato_id: candidatoId,
                  etapa_id: etapa.id,
                  usuario_id: userId,
                })
              }
            }
          } else {
            console.log(`Mensagem ${msgId} - Candidato não qualificado para a vaga.`)
            // Remove from Kanban visibility (General Candidates List only)
            await supabase.from('candidatos').update({ etapa_id: null }).eq('id', candidatoId)
            finalStatus = 'nao_qualificado'
          }
        } else {
          console.log(`Mensagem ${msgId} - Nenhuma vaga compatível. Status atualizado para sem_vaga_compativel.`)
          // No match: Keep without vacancy and remove from any default Kanban stage assigned by analyze-resume
          await supabase.from('candidatos').update({ vaga_id: null, etapa_id: null }).eq('id', candidatoId)
          finalStatus = 'sem_vaga_compativel'
        }

        // Commit audit record
        await supabase
          .from('email_importacoes')
          .update({
            status: finalStatus,
            candidato_id: candidatoId,
            vaga_id_identificada: vaga_id || null,
            confianca_identificacao: confianca || 'nenhuma',
            justificativa_ia: justificativa || '',
            anexo_filename: filename,
            anexo_storage_path: storagePath,
            processado_em: new Date().toISOString()
          })
          .eq('id', importId)

        // Add the processed label on Gmail to prevent redundant fetching
        if (labelId) {
          await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/modify`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              addLabelIds: [labelId],
              removeLabelIds: ['UNREAD'],
            }),
          })
        }

        results.push({ msgId, status: finalStatus, candidatoId })

      } catch (procError: any) {
        console.error(`Erro ao processar mensagem ${msgId}:`, procError)
        await supabase
          .from('email_importacoes')
          .update({ status: 'erro', erro_detalhes: procError.message, processado_em: new Date().toISOString() })
          .eq('id', importId)
          
        results.push({ msgId, status: 'erro', error: procError.message })
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed_count: results.length, results }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error: any) {
    console.error('Fatal Cron Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

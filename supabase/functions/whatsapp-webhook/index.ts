import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const bodyText = await req.text()
    let body: any = {}
    if (bodyText) {
      try {
        body = JSON.parse(bodyText)
      } catch (e) {
        console.error('Payload JSON inválido')
      }
    }

    const events = Array.isArray(body) ? body : [body]

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    for (const event of events) {
      let messageId = null
      let status = null

      // Mapping variations of UAZAPI/Evolution API webhooks
      if (event?.data?.id) {
        messageId = event.data.id
        status = event.data.status
      } else if (event?.id) {
        messageId = event.id
        status = event.status
      } else if (event?.data?.key?.id) {
        messageId = event.data.key.id
        status = event.data.update?.status || event.status || event.data.status
      }

      if (!messageId) continue

      let mappedStatus = null

      let selectedButtonId = null
      let incomingText = null
      let isIncomingMessage = false
      let remoteJid = event?.data?.key?.remoteJid || event?.sender || event?.data?.sender || ''

      // UAZAPI / Evolution Button response mapping
      if (event?.data?.message?.buttonsResponseMessage?.selectedButtonId) {
        selectedButtonId = event.data.message.buttonsResponseMessage.selectedButtonId
        incomingText = event.data.message.buttonsResponseMessage.selectedDisplayText
        isIncomingMessage = true
      } else if (event?.data?.message?.templateButtonReplyMessage?.selectedId) {
        selectedButtonId = event.data.message.templateButtonReplyMessage.selectedId
        incomingText = event.data.message.templateButtonReplyMessage.selectedDisplayText
        isIncomingMessage = true
      } else if (event?.data?.message?.conversation) {
        incomingText = event.data.message.conversation
        isIncomingMessage = true
      } else if (event?.data?.message?.extendedTextMessage?.text) {
        incomingText = event.data.message.extendedTextMessage.text
        isIncomingMessage = true
      }

      if (isIncomingMessage && remoteJid) {
        const phoneMatch = remoteJid.match(/\d+/)
        if (phoneMatch) {
          const phoneNum = phoneMatch[0]
          
          let candId = null
          
          if (selectedButtonId) {
            const btnMatch = selectedButtonId.match(/^(sim|nao)_(.+)$/)
            if (btnMatch) {
              const resposta = btnMatch[1]
              candId = btnMatch[2]
              
              await supabase.from('respostas_whatsapp').insert({
                candidato_id: candId,
                resposta: resposta,
                mensagem_id: messageId
              })
              
              const { data: cand } = await supabase.from('candidatos').select('etapa_id').eq('id', candId).single()
              if (cand && cand.etapa_id) {
                const { data: tpl } = await supabase.from('templates_mensagens').select('*').eq('etapa_id', cand.etapa_id).eq('tipo', 'chatbot_interativo').maybeSingle()
                
                if (tpl) {
                  const acao = resposta === 'sim' ? tpl.botao_sim_acao : tpl.botao_nao_acao
                  
                  if (acao === 'remover') {
                    await supabase.from('candidatos').update({ ativo_kanban: false, motivo_inativo: 'Recusou via WhatsApp' }).eq('id', candId)
                  } else if (acao === 'mover' && tpl.etapa_destino_id) {
                    await supabase.from('candidatos').update({ etapa_id: tpl.etapa_destino_id }).eq('id', candId)
                  }
                }
              }
            }
          }

          if (!candId) {
            const { data: cands } = await supabase.from('candidatos').select('id').ilike('telefone', `%${phoneNum.substring(2)}%`).limit(1)
            if (cands && cands.length > 0) candId = cands[0].id
          }

          if (candId) {
            await supabase.from('conversas_whatsapp').insert({
              candidato_id: candId,
              texto: incomingText || selectedButtonId || '',
              direcao: 'recebida'
            })
          }
        }
      }

      if (typeof status === 'string') {
        const s = status.toUpperCase()
        if (s === 'SENT' || s === 'SERVER_ACK') mappedStatus = 'enviada'
        if (s === 'DELIVERED' || s === 'DELIVERY_ACK') mappedStatus = 'entregue'
        if (s === 'READ' || s === 'READ_ACK' || s === 'PLAYED') mappedStatus = 'lida'
        if (s === 'ERROR' || s === 'FAILED' || s === 'REJECTED') mappedStatus = 'falha'
      } else if (typeof status === 'number') {
        if (status === 1) mappedStatus = 'enviada' 
        if (status === 2) mappedStatus = 'entregue' 
        if (status === 3 || status === 4) mappedStatus = 'lida' 
        if (status === 5) mappedStatus = 'falha' 
      }

      if (mappedStatus && !isIncomingMessage) {
        const { data: existingMsg } = await supabase
          .from('mensagens_whatsapp')
          .select('enviado_em')
          .eq('external_id', messageId)
          .single()

        const updateData: any = { status: mappedStatus }

        if (
          (mappedStatus === 'enviada' || mappedStatus === 'entregue' || mappedStatus === 'lida') &&
          existingMsg &&
          !existingMsg.enviado_em
        ) {
          updateData.enviado_em = new Date().toISOString()
        }

        await supabase.from('mensagens_whatsapp').update(updateData).eq('external_id', messageId)
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Webhook erro:', error)
    // Always return 200 for webhooks to prevent provider from retrying indefinitely on logical errors
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

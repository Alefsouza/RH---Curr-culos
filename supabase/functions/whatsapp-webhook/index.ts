import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { normalizePhone } from '../_shared/phone.ts'

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

      let selectedButtonId = null
      let incomingText = null
      let isIncomingMessage = false
      let remoteJid = event?.data?.key?.remoteJid || event?.sender || event?.data?.sender || ''

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
          let phoneNum = phoneMatch[0]
          const normalized = normalizePhone(phoneNum)
          if (normalized) {
            phoneNum = normalized
          }

          let respostaClassificada = null
          let candId = null

          if (selectedButtonId) {
            const btnMatch = selectedButtonId.match(/^(sim|nao)_(.+)$/)
            if (btnMatch) {
              respostaClassificada = btnMatch[1]
              candId = btnMatch[2]
            }
          } else if (incomingText) {
            const txt = incomingText.toLowerCase().trim()
            if (['sim', 's', 'sim!', 'sin'].includes(txt)) respostaClassificada = 'sim'
            else if (['nao', 'não', 'n', 'não!'].includes(txt)) respostaClassificada = 'nao'
          }

          let candInfo: any = null

          if (!candId) {
            const { data: cands } = await supabase
              .from('candidatos')
              .select('id, user_id, etapa_id')
              .ilike('telefone', `%${phoneNum}%`)
              .limit(1)
            if (cands && cands.length > 0) {
              candId = cands[0].id
              candInfo = cands[0]
            }
          } else {
            const { data: c } = await supabase
              .from('candidatos')
              .select('id, user_id, etapa_id')
              .eq('id', candId)
              .single()
            candInfo = c
          }

          if (candId) {
            // Save to conversas_whatsapp
            const { error: convErr } = await supabase.from('conversas_whatsapp').insert({
              candidato_id: candId,
              texto: incomingText || selectedButtonId || '',
              direcao: 'recebida',
              uazapi_message_id: messageId,
            })

            if (convErr && convErr.code === '23505') {
              console.log('Mensagem duplicada (idempotência), ignorando:', messageId)
              continue
            }

            // Save to mensagens_whatsapp to fulfill AC
            const { error: msgErr } = await supabase.from('mensagens_whatsapp').insert({
              candidato_id: candId,
              numero_whatsapp: phoneNum,
              user_id: candInfo?.user_id || '00000000-0000-0000-0000-000000000000',
              status: 'recebida',
              direcao: 'recebida',
              conteudo: incomingText || selectedButtonId || '',
              uazapi_message_id: messageId,
              tipo: selectedButtonId ? 'botao' : 'texto',
            })

            if (msgErr && msgErr.code === '23505') {
              console.log(
                'Mensagem duplicada em mensagens_whatsapp (idempotência), ignorando:',
                messageId,
              )
              continue
            }

            if (respostaClassificada) {
              await supabase.from('respostas_whatsapp').insert({
                candidato_id: candId,
                resposta: respostaClassificada,
                mensagem_id: messageId,
              })
            }

            const updatePayload: any = {
              ultima_resposta_whatsapp: incomingText || selectedButtonId || '',
              ultima_resposta_em: new Date().toISOString(),
            }

            if (candInfo && candInfo.etapa_id && respostaClassificada) {
              let moved = false

              const { data: tpl } = await supabase
                .from('templates_mensagens')
                .select('*')
                .eq('etapa_id', candInfo.etapa_id)
                .eq('tipo', 'chatbot_interativo')
                .maybeSingle()

              if (tpl) {
                const acao =
                  respostaClassificada === 'sim' ? tpl.botao_sim_acao : tpl.botao_nao_acao
                if (acao === 'remover') {
                  updatePayload.ativo_kanban = false
                  updatePayload.motivo_inativo = 'Recusou via WhatsApp'
                  moved = true
                } else if (acao === 'mover' && tpl.etapa_destino_id) {
                  updatePayload.etapa_id = tpl.etapa_destino_id
                  moved = true
                }
              }

              // Ação Automática fallback: if "sim", move candidate to next stage based on sequence
              if (respostaClassificada === 'sim' && !moved) {
                const { data: etapas } = await supabase
                  .from('etapas')
                  .select('id')
                  .eq('user_id', candInfo.user_id)
                  .order('ordem', { ascending: true })
                if (etapas) {
                  const currentIndex = etapas.findIndex((e) => e.id === candInfo.etapa_id)
                  if (currentIndex >= 0 && currentIndex + 1 < etapas.length) {
                    updatePayload.etapa_id = etapas[currentIndex + 1].id
                  }
                }
              }
            }

            if (Object.keys(updatePayload).length > 0) {
              await supabase.from('candidatos').update(updatePayload).eq('id', candId)
            }
          } else {
            console.log(`Mensagem recebida de ${phoneNum} ignorada: nenhum candidato encontrado.`)
          }
        }
      }

      // Existing status update logic for outgoing messages
      let mappedStatus = null
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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

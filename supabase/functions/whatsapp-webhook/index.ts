import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

export const normalizePhone = (phone: string | null | undefined): string | null => {
  if (!phone) return null
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.substring(2)
  }
  return digits || null
}

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

      let contextMsgId = null

      const msg = event?.data?.message
      if (msg) {
        if (msg.contextInfo?.stanzaId) {
          contextMsgId = msg.contextInfo.stanzaId
        }

        if (msg.buttonsResponseMessage?.selectedButtonId) {
          selectedButtonId = msg.buttonsResponseMessage.selectedButtonId
          incomingText = msg.buttonsResponseMessage.selectedDisplayText
          isIncomingMessage = true
        } else if (msg.interactiveResponseMessage?.nativeFlowResponseMessage) {
          try {
            const params = JSON.parse(
              msg.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson || '{}',
            )
            selectedButtonId = params.id
            incomingText = msg.interactiveResponseMessage.nativeFlowResponseMessage.name
            isIncomingMessage = true
          } catch (e) {}
        } else if (msg.templateButtonReplyMessage?.selectedId) {
          selectedButtonId = msg.templateButtonReplyMessage.selectedId
          incomingText = msg.templateButtonReplyMessage.selectedDisplayText
          isIncomingMessage = true
        } else if (msg.listResponseMessage) {
          selectedButtonId =
            msg.listResponseMessage.singleSelectReply?.selectedRowId ||
            msg.listResponseMessage.selectedRowId
          incomingText =
            msg.listResponseMessage.title ||
            msg.listResponseMessage.description ||
            msg.listResponseMessage.selectedDisplayText ||
            selectedButtonId ||
            '[Lista]'
          isIncomingMessage = true
        } else if (msg.pollResponseMessage) {
          const opts = msg.pollResponseMessage.selectedOptions
          incomingText = Array.isArray(opts)
            ? opts.map((o: any) => o?.name || o).join(', ')
            : opts || '[Enquete Respondida]'
          selectedButtonId = incomingText
          isIncomingMessage = true
        } else if (msg.imageMessage) {
          incomingText = msg.imageMessage.caption
            ? `[Imagem] ${msg.imageMessage.caption}`
            : '[Imagem Recebida]'
          isIncomingMessage = true
        } else if (msg.audioMessage) {
          incomingText = '[Áudio Recebido]'
          isIncomingMessage = true
        } else if (msg.documentMessage) {
          incomingText = msg.documentMessage.fileName
            ? `[Documento] ${msg.documentMessage.fileName}`
            : '[Documento Recebido]'
          isIncomingMessage = true
        } else if (msg.videoMessage) {
          incomingText = msg.videoMessage.caption
            ? `[Vídeo] ${msg.videoMessage.caption}`
            : '[Vídeo Recebido]'
          isIncomingMessage = true
        } else if (msg.conversation) {
          incomingText = msg.conversation
          isIncomingMessage = true
        } else if (msg.extendedTextMessage?.text) {
          incomingText = msg.extendedTextMessage.text
          isIncomingMessage = true
        }
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
            } else {
              const txt = selectedButtonId.toLowerCase().trim()
              if (
                ['sim', 's', 'sim!', 'sin', 'quero', 'sim|sim'].includes(txt) ||
                txt.startsWith('sim|')
              )
                respostaClassificada = 'sim'
              else if (
                [
                  'nao',
                  'não',
                  'n',
                  'não!',
                  'nao tenho interesse',
                  'não tenho interesse',
                  'nao|nao',
                  'não|nao',
                ].includes(txt) ||
                txt.startsWith('nao|')
              )
                respostaClassificada = 'nao'
            }
          }

          if (!respostaClassificada && incomingText) {
            const txt = incomingText.toLowerCase().trim()
            if (
              ['sim', 's', 'sim!', 'sin', 'quero', 'sim|sim'].includes(txt) ||
              txt.startsWith('sim|')
            )
              respostaClassificada = 'sim'
            else if (
              [
                'nao',
                'não',
                'n',
                'não!',
                'nao tenho interesse',
                'não tenho interesse',
                'nao|nao',
                'não|nao',
              ].includes(txt) ||
              txt.startsWith('nao|')
            )
              respostaClassificada = 'nao'
          }

          let candInfo: any = null

          if (!candId) {
            const { data: matchedId, error: rpcErr } = await supabase.rpc(
              'buscar_candidato_por_telefone',
              {
                telefone_input: phoneNum,
              },
            )
            if (!rpcErr && matchedId) {
              candId = matchedId
              const { data: c } = await supabase
                .from('candidatos')
                .select('id, user_id, etapa_id')
                .eq('id', candId)
                .single()
              candInfo = c
            }
          } else {
            const { data: c } = await supabase
              .from('candidatos')
              .select('id, user_id, etapa_id')
              .eq('id', candId)
              .single()
            candInfo = c
          }

          // Determinar o user_id (tentar pegar do candidato, senao do historico, senao fallback)
          let finalUserId = candInfo?.user_id
          if (!finalUserId) {
            const { data: lastMsg } = await supabase
              .from('mensagens_whatsapp')
              .select('user_id')
              .eq('numero_whatsapp', phoneNum)
              .limit(1)
              .maybeSingle()
            if (lastMsg) finalUserId = lastMsg.user_id
          }
          if (!finalUserId) {
            const { data: anyUser } = await supabase
              .from('usuarios')
              .select('id')
              .limit(1)
              .maybeSingle()
            finalUserId = anyUser?.id
          }

          if (!finalUserId) {
            console.log(
              `Mensagem de ${phoneNum} sem user_id resolvido. Abortando insert em mensagens_whatsapp.`,
            )
            await supabase.from('whatsapp_eventos_nao_identificados').insert({
              telefone_recebido: phoneNum,
              payload_completo: event,
              conteudo: incomingText || selectedButtonId || '',
            })
            continue
          }

          // Sempre salvar na tabela principal para aparecer no painel (mesmo sem candidato)
          const { error: msgErr } = await supabase.from('mensagens_whatsapp').insert({
            candidato_id: candId || null,
            numero_whatsapp: phoneNum,
            user_id: finalUserId,
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

          if (candId && candInfo) {
            if (respostaClassificada) {
              await supabase.from('respostas_whatsapp').insert({
                candidato_id: candId,
                resposta: respostaClassificada,
                mensagem_id: contextMsgId || messageId,
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
            console.log(
              `Mensagem recebida de ${phoneNum} não tem candidato vinculado. Salvando log em eventos_nao_identificados tbm.`,
            )
            await supabase.from('whatsapp_eventos_nao_identificados').insert({
              telefone_recebido: phoneNum,
              payload_completo: event,
              conteudo: incomingText || selectedButtonId || '',
            })
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
          .or(`external_id.eq.${messageId},uazapi_message_id.eq.${messageId}`)
          .limit(1)
          .maybeSingle()

        const updateData: any = { status: mappedStatus }

        if (
          (mappedStatus === 'enviada' || mappedStatus === 'entregue' || mappedStatus === 'lida') &&
          existingMsg &&
          !existingMsg.enviado_em
        ) {
          updateData.enviado_em = new Date().toISOString()
        }

        await supabase
          .from('mensagens_whatsapp')
          .update(updateData)
          .or(`external_id.eq.${messageId},uazapi_message_id.eq.${messageId}`)
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

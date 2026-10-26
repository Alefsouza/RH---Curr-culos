import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

export const normalizePhone = (phone: string | null | undefined): string | null => {
  if (!phone) return null
  const raw = String(phone).trim()
  if (!raw) return null

  const isolatedNineMatch = raw.match(
    /(?:(?:\+?55\s*)?(?:\(?([1-9]{2})\)?\s*))?9\s*(\d{4})[\s.-]?(\d{4})/,
  )
  if (isolatedNineMatch) {
    const ddd = isolatedNineMatch[1] || '11'
    return `${ddd}9${isolatedNineMatch[2]}${isolatedNineMatch[3]}`
  }

  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.substring(2)
  }

  if (digits.length === 10) {
    const ddd = digits.substring(0, 2)
    const rest = digits.substring(2)
    if (raw.includes('9') && !rest.startsWith('9')) {
      return `${ddd}9${rest}`
    }
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
    console.log('Raw Webhook Payload received:', bodyText)

    let body: any = {}
    if (bodyText) {
      try {
        body = JSON.parse(bodyText)
      } catch (e) {
        console.error('Payload JSON inválido', e)
        body = { unparseable: true, raw_text: bodyText }
      }
    }

    const events = Array.isArray(body) ? body : [body]

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    for (const event of events) {
      if (event?.unparseable) {
        await supabase.from('whatsapp_eventos_nao_identificados').insert({
          payload_completo: { raw: event.raw_text },
          conteudo: 'Payload JSON inválido',
        })
        continue
      }

      let messageId = null
      let status = null

      if (event?.EventType === 'messages' && event?.message?.messageid) {
        messageId = event.message.messageid
        status = event.message.status
      } else if (event?.data?.id) {
        messageId = event.data.id
        status = event.data.status
      } else if (event?.id) {
        messageId = event.id
        status = event.status
      } else if (event?.data?.key?.id) {
        messageId = event.data.key.id
        status = event.data.update?.status || event.status || event.data.status
      }

      if (!messageId) {
        console.log('Mensagem sem ID identificado, salvando no log:', JSON.stringify(event))

        let possiblePhone =
          event?.message?.sender_pn ||
          event?.data?.key?.remoteJid ||
          event?.sender ||
          event?.data?.sender ||
          ''
        if (typeof possiblePhone === 'string' && possiblePhone.includes('@')) {
          possiblePhone = possiblePhone.split('@')[0]
        }
        const phoneMatch = typeof possiblePhone === 'string' ? possiblePhone.match(/\d+/) : null
        if (phoneMatch) {
          const normalized = normalizePhone(phoneMatch[0])
          if (normalized) possiblePhone = normalized
        }

        await supabase.from('whatsapp_eventos_nao_identificados').insert({
          payload_completo: event,
          conteudo: 'Formato não reconhecido - Sem Message ID',
          telefone_recebido: possiblePhone || null,
        })
        continue
      }

      let selectedButtonId = null
      let incomingText = null
      let isIncomingMessage = false
      let isOutgoingMessage = false

      // Detectar se a mensagem foi enviada pela própria conta conectada (fromMe / owner)
      const fromMe =
        event?.message?.fromMe === true ||
        event?.data?.key?.fromMe === true ||
        event?.data?.fromMe === true ||
        event?.fromMe === true ||
        event?.data?.message?.fromMe === true

      // Para mensagens enviadas pelo RH (fromMe), o destinatário é o telefone do chat!
      // Para mensagens recebidas de candidatos, o remetente é o remoteJid / sender_pn.
      let chatPhone =
        event?.chat?.phone ||
        event?.chat?.wa_chatid ||
        event?.data?.chat?.phone ||
        event?.message?.chat_phone ||
        event?.message?.remoteJid ||
        event?.data?.key?.remoteJid ||
        ''
      if (typeof chatPhone === 'string' && chatPhone.includes('@')) {
        chatPhone = chatPhone.split('@')[0]
      }

      let remoteJid = ''
      if (fromMe) {
        isOutgoingMessage = true
        // O destinatário do chat é o telefone do candidato
        remoteJid = chatPhone || event?.data?.key?.remoteJid || ''
      } else {
        remoteJid =
          event?.message?.sender_pn ||
          event?.data?.key?.remoteJid ||
          event?.sender ||
          event?.data?.sender ||
          chatPhone ||
          ''
      }
      if (typeof remoteJid === 'string' && remoteJid.includes('@')) {
        remoteJid = remoteJid.split('@')[0]
      }

      let contextMsgId = event?.message?.quoted || null

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
      } else if (event?.EventType === 'messages' && event?.message) {
        const uazapiMsg = event.message
        if (
          uazapiMsg.messageType === 'TemplateButtonReplyMessage' ||
          uazapiMsg.buttonOrListid ||
          uazapiMsg.vote
        ) {
          selectedButtonId = uazapiMsg.buttonOrListid || uazapiMsg.vote
          incomingText = uazapiMsg.vote || uazapiMsg.buttonOrListid
          isIncomingMessage = true
        } else if (uazapiMsg.text) {
          incomingText = uazapiMsg.text
          isIncomingMessage = true
        } else if (uazapiMsg.content) {
          incomingText = uazapiMsg.content
          isIncomingMessage = true
        }
      }

      // Se for mensagem enviada pela conta conectada (fromMe), processa como enviada
      if (fromMe && isIncomingMessage) {
        isIncomingMessage = false
        isOutgoingMessage = true
      }

      if ((isIncomingMessage || isOutgoingMessage) && remoteJid) {
        const phoneMatch = remoteJid.match(/\d+/)
        if (phoneMatch) {
          let phoneNum = phoneMatch[0]
          const normalized = normalizePhone(phoneNum)
          if (normalized) {
            phoneNum = normalized
          }

          let candId = null
          let candInfo: any = null

          // Primeiro, tentamos pegar o candId direto do botão (se for um payload nosso)
          if (selectedButtonId) {
            const btnMatch = selectedButtonId.match(/^(sim|nao)_(.+)$/i)
            if (btnMatch) {
              candId = btnMatch[2]
            }
          }

          // Se não tiver, busca pelo telefone
          if (!candId) {
            const { data: matchedId, error: rpcErr } = await supabase.rpc(
              'buscar_candidato_por_telefone',
              {
                telefone_input: phoneNum,
              },
            )
            if (!rpcErr && matchedId) {
              candId = matchedId
            }
          }

          if (candId) {
            const { data: c } = await supabase
              .from('candidatos')
              .select('id, user_id, etapa_id')
              .eq('id', candId)
              .maybeSingle()
            if (c) candInfo = c
          }

          // Descobrir qual o template provável desta interação para classificar "Sim" / "Não"
          let resolvedTemplateId = null
          let templateData = null

          if (contextMsgId) {
            const { data: origMsg } = await supabase
              .from('mensagens_whatsapp')
              .select('template_id')
              .or(`uazapi_message_id.eq.${contextMsgId},external_id.eq.${contextMsgId}`)
              .limit(1)
              .maybeSingle()
            if (origMsg?.template_id) {
              resolvedTemplateId = origMsg.template_id
            }
          }

          if (!resolvedTemplateId && candId) {
            const { data: lastBotMsg } = await supabase
              .from('mensagens_whatsapp')
              .select('template_id')
              .eq('candidato_id', candId)
              .eq('direcao', 'enviada')
              .not('template_id', 'is', null)
              .order('criado_em', { ascending: false })
              .limit(1)
              .maybeSingle()

            if (lastBotMsg?.template_id) {
              resolvedTemplateId = lastBotMsg.template_id
            }
          }

          if (resolvedTemplateId) {
            const { data: tData } = await supabase
              .from('templates_mensagens')
              .select('*')
              .eq('id', resolvedTemplateId)
              .maybeSingle()
            if (tData) {
              templateData = tData
            }
          }

          // Classificar a resposta com base no texto recebido e no template
          let respostaClassificada = null

          const txtToCheck = (incomingText || selectedButtonId || '').toLowerCase().trim()

          if (selectedButtonId) {
            const btnMatch = selectedButtonId.match(/^(sim|nao)_(.+)$/i)
            if (btnMatch) {
              respostaClassificada = btnMatch[1].toLowerCase()
            }
          }

          if (!respostaClassificada) {
            const simWords = ['sim', 's', 'sim!', 'sin', 'quero', 'sim|sim']
            const naoWords = [
              'nao',
              'não',
              'n',
              'não!',
              'nao tenho interesse',
              'não tenho interesse',
              'nao|nao',
              'não|nao',
            ]

            if (templateData) {
              if (templateData.botao_sim_texto)
                simWords.push(templateData.botao_sim_texto.toLowerCase().trim())
              if (templateData.botao_nao_texto)
                naoWords.push(templateData.botao_nao_texto.toLowerCase().trim())
            }

            if (simWords.some((w) => txtToCheck === w || txtToCheck.startsWith('sim|'))) {
              respostaClassificada = 'sim'
            } else if (naoWords.some((w) => txtToCheck === w || txtToCheck.startsWith('nao|'))) {
              respostaClassificada = 'nao'
            }
          }

          if (!respostaClassificada) {
            const normalizedText = txtToCheck.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            if (/\bnao\b/i.test(normalizedText)) {
              respostaClassificada = 'nao'
            } else if (/\bsim\b/i.test(normalizedText)) {
              respostaClassificada = 'sim'
            }
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

          // Definir direção e status corretos (enviada vs recebida)
          const msgDirecao = isOutgoingMessage ? 'enviada' : 'recebida'
          const msgStatus = isOutgoingMessage ? 'enviada' : 'recebida'

          // Sempre salvar na tabela principal para aparecer no painel (mesmo sem candidato)
          const { error: msgErr } = await supabase.from('mensagens_whatsapp').insert({
            candidato_id: candId || null,
            numero_whatsapp: phoneNum,
            user_id: finalUserId,
            status: msgStatus,
            direcao: msgDirecao,
            conteudo: incomingText || selectedButtonId || '',
            uazapi_message_id: messageId,
            tipo: selectedButtonId ? 'botao' : 'texto',
            enviado_em: isOutgoingMessage ? new Date().toISOString() : null,
          })

          if (msgErr && msgErr.code === '23505') {
            console.log(
              'Mensagem duplicada em mensagens_whatsapp (idempotência), ignorando:',
              messageId,
            )
            continue
          }

          if (candId) {
            const { error: convErr } = await supabase.from('conversas_whatsapp').insert({
              candidato_id: candId,
              texto: incomingText || selectedButtonId || '',
              direcao: msgDirecao,
              uazapi_message_id: messageId,
            })
            if (convErr && convErr.code !== '23505') {
              console.error('Erro ao salvar conversa_whatsapp', convErr)
            }
          }

          if (isIncomingMessage && candId && respostaClassificada) {
            await supabase.from('respostas_whatsapp').insert({
              candidato_id: candId,
              resposta: respostaClassificada,
              mensagem_id: contextMsgId || messageId,
            })
          }

          if (isIncomingMessage && candId && candInfo) {
            const updatePayload: any = {}
            if (respostaClassificada) {
              updatePayload.ultima_resposta_whatsapp =
                respostaClassificada === 'sim' ? 'Sim' : 'Não'
              updatePayload.ultima_resposta_em = new Date().toISOString()
            }

            if (respostaClassificada) {
              let acao = 'manter'
              let etapaDestino = null

              if (templateData) {
                if (respostaClassificada === 'sim') {
                  acao = templateData.botao_sim_acao || 'manter'
                  etapaDestino = templateData.etapa_destino_id
                } else if (respostaClassificada === 'nao') {
                  // Se o template tiver 'mover' com etapa_destino, segue a movimentação configurada (permanece no Kanban).
                  // Caso contrário (padrão quando o template não define ação de mover), aplica a NOVA REGRA:
                  // retira do Kanban e arquiva (ativo_kanban=false, motivo_inativo='Arquivado')
                  acao = templateData.botao_nao_acao === 'mover' ? 'mover' : 'arquivar'
                  etapaDestino = templateData.etapa_destino_id
                }
              } else {
                // Default fallback sem template para resposta 'nao': retira do Kanban e arquiva
                acao = respostaClassificada === 'nao' ? 'arquivar' : 'manter'
              }

              if (respostaClassificada === 'sim') {
                if (acao === 'remover' || acao === 'inativar') {
                  updatePayload.ativo_kanban = false
                  updatePayload.motivo_inativo = 'Inativado via automação WhatsApp'
                  console.log(`Candidato ${candId} marcado como inativo no Kanban via resposta Sim`)
                } else if (acao === 'mover') {
                  if (etapaDestino) {
                    updatePayload.etapa_id = etapaDestino
                    console.log(`Candidato ${candId} será movido para a etapa ${etapaDestino}`)
                  } else {
                    console.warn(
                      `Ação "mover" configurada mas sem etapa_destino_id no template ${templateData?.id}`,
                    )
                  }
                }
              } else if (respostaClassificada === 'nao') {
                if (acao === 'mover' && etapaDestino) {
                  updatePayload.etapa_id = etapaDestino
                  console.log(
                    `Candidato ${candId} manteve-se ativo no Kanban e foi movido para etapa ${etapaDestino} após resposta Não`,
                  )
                } else {
                  // NOVA REGRA DO RH no webhook WhatsApp:
                  // (a) Gravar observação no Histórico do candidato com o texto "Não tem interesse na vaga"
                  // (b) Retirar do Kanban (ativo_kanban=false)
                  // (c) Mover/marcar o candidato para status/etapa "Arquivado" (motivo_inativo='Arquivado'),
                  //     preservando SEMPRE a vaga vinculada e todos os dados do candidato.
                  // NUNCA exclusão física nem soft delete (deleted_at).
                  updatePayload.ativo_kanban = false
                  updatePayload.motivo_inativo = 'Arquivado'

                  try {
                    const { error: obsErr } = await supabase.from('candidato_observacoes').insert({
                      candidato_id: candId,
                      usuario_id: finalUserId || null,
                      texto: 'Não tem interesse na vaga',
                    })
                    if (obsErr) {
                      console.error(`Erro ao gravar observação de resposta Não para ${candId}:`, obsErr)
                    } else {
                      console.log(`Observação "Não tem interesse na vaga" registrada para candidato ${candId}`)
                    }
                  } catch (obsEx) {
                    console.error(`Exceção ao inserir observação para ${candId}:`, obsEx)
                  }

                  console.log(
                    `Candidato ${candId} retirado do Kanban e arquivado após resposta Não`,
                  )
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

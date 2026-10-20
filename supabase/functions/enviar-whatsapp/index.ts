import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import jwt from 'npm:jsonwebtoken'
import { corsHeaders } from '../_shared/cors.ts'
import {
  extractUazapiErrorMessage,
  formatUazapiErrorForDisplay,
  checkNumbersOnWhatsApp,
} from '../_shared/uazapi.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')

    let userId: string | null = null
    if (token) {
      try {
        const decoded = jwt.decode(token) as any
        userId = decoded?.sub || null
      } catch (e) {
        console.log('Erro ao decodificar token:', e)
      }
    }

    let body
    try {
      body = JSON.parse(await req.text())
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Payload inválido. Formato JSON esperado.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { candidato_id, etapa_id } = body

    if (!candidato_id || !etapa_id) {
      return new Response(
        JSON.stringify({
          error: 'Dados obrigatórios faltando: candidato_id e etapa_id são necessários.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Se userId não foi extraído do token JWT, busca usuário admin ou primeiro usuário do sistema
    if (!userId) {
      const { data: adminUser } = await supabase
        .from('usuarios')
        .select('id')
        .order('is_admin', { ascending: false })
        .order('criado_em', { ascending: true })
        .limit(1)
        .maybeSingle()

      userId = adminUser?.id || null
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Usuário não autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // UAZAPI configuration (defined at top level)
    const uazapiUrl = Deno.env.get('UAZAPI_URL') || 'https://cvviasudeste.uazapi.com'
    const uazapiToken = Deno.env.get('UAZAPI_TOKEN') || Deno.env.get('UAZAPI_KEY') || ''
    const instanceId =
      Deno.env.get('UAZAPI_INSTANCE_ID') ||
      Deno.env.get('UAZAPI_INSTANCE') ||
      Deno.env.get('INSTANCE_ID') ||
      'cvviasudeste'

    let baseUrl = uazapiUrl.endsWith('/') ? uazapiUrl.slice(0, -1) : uazapiUrl
    if (baseUrl.startsWith('http://') && !baseUrl.includes('localhost')) {
      baseUrl = baseUrl.replace('http://', 'https://')
    }

    if (!uazapiToken) {
      return new Response(
        JSON.stringify({
          error: true,
          message: 'Configuração ausente: UAZAPI_TOKEN não encontrado.',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // 1. Buscando candidato e telefone
    // Nota: dados de recrutamento são compartilhados entre todos os usuários autenticados (RLS shared policies).
    // Não filtramos por user_id para evitar 404 quando o candidato foi criado por outro recrutador.
    const { data: candidato, error: candidatoError } = await supabase
      .from('candidatos')
      .select('*, vagas!candidatos_vaga_id_fkey(titulo)')
      .eq('id', candidato_id)
      .single()

    if (candidatoError || !candidato) {
      return new Response(JSON.stringify({ error: 'Candidato não encontrado.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Use telefone_normalizado (comma-separated) with fallback to telefone
    const telefoneRaw = candidato.telefone_normalizado || candidato.telefone
    if (!telefoneRaw) {
      return new Response(
        JSON.stringify({ warning: true, message: 'Candidato não possui telefone cadastrado.' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // 2. Buscando template da etapa
    // Templates também são compartilhados entre usuários autenticados.
    const { data: template, error: templateError } = await supabase
      .from('templates_mensagens')
      .select('*')
      .eq('etapa_id', etapa_id)
      .maybeSingle()

    const isChatbotTemplate =
      template?.tipo === 'chatbot_interativo' || template?.tipo === 'chatbot'
    const hasValidContent = isChatbotTemplate
      ? Boolean(template?.pergunta_texto?.trim())
      : Boolean(template?.texto?.trim())

    if (templateError || !template || !hasValidContent) {
      return new Response(
        JSON.stringify({
          warning: true,
          message: 'Template de mensagem não encontrado para esta etapa.',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // 3. Substituindo variáveis na mensagem
    const nomeCandidato = candidato.nome || ''
    const tituloVaga = Array.isArray(candidato.vagas)
      ? candidato.vagas[0]?.titulo
      : (candidato.vagas as any)?.titulo

    let mensagemTexto = template.texto || ''
    mensagemTexto = mensagemTexto.replace(/{{nome}}/gi, nomeCandidato)
    mensagemTexto = mensagemTexto.replace(/{{nome_candidato}}/gi, nomeCandidato)
    mensagemTexto = mensagemTexto.replace(/{{vaga}}/gi, tituloVaga || 'a vaga')
    mensagemTexto = mensagemTexto.replace(/{{nome_vaga}}/gi, tituloVaga || 'a vaga')
    mensagemTexto = mensagemTexto.replace(/{nome_candidato}/gi, nomeCandidato)
    mensagemTexto = mensagemTexto.replace(/{nome_vaga}/gi, tituloVaga || 'a vaga')

    let tituloTexto = template.titulo_texto || ''
    tituloTexto = tituloTexto.replace(/{{nome}}/gi, nomeCandidato)
    tituloTexto = tituloTexto.replace(/{{nome_candidato}}/gi, nomeCandidato)
    tituloTexto = tituloTexto.replace(/{{vaga}}/gi, tituloVaga || 'a vaga')
    tituloTexto = tituloTexto.replace(/{{nome_vaga}}/gi, tituloVaga || 'a vaga')

    const isChatbot = template.tipo === 'chatbot_interativo' || template.tipo === 'chatbot'
    let perguntaTexto = template.pergunta_texto || template.texto || ''
    const btnSimText = (template.botao_sim_texto || 'Sim').substring(0, 20)
    const btnNaoText = (template.botao_nao_texto || 'Não').substring(0, 20)

    if (isChatbot) {
      perguntaTexto = perguntaTexto.replace(/{{nome}}/gi, nomeCandidato)
      perguntaTexto = perguntaTexto.replace(/{{nome_candidato}}/gi, nomeCandidato)
      perguntaTexto = perguntaTexto.replace(/{{vaga}}/gi, tituloVaga || 'a vaga')
      perguntaTexto = perguntaTexto.replace(/{{nome_vaga}}/gi, tituloVaga || 'a vaga')
      perguntaTexto = perguntaTexto.replace(/{nome_candidato}/gi, nomeCandidato)
      perguntaTexto = perguntaTexto.replace(/{nome_vaga}/gi, tituloVaga || 'a vaga')
    }

    // 4. Preparar números (split comma-separated)
    const telefonesStrList = telefoneRaw
      .split(',')
      .map((t: string) => t.trim())
      .filter(Boolean)
    const validPhones: string[] = []

    for (const t of telefonesStrList) {
      let cleanPhone = t.replace(/\D/g, '')
      if (cleanPhone && !cleanPhone.startsWith('55')) {
        cleanPhone = '55' + cleanPhone
      }
      if (cleanPhone.length >= 12 && cleanPhone.length <= 15) {
        validPhones.push(cleanPhone)
      }
    }

    if (validPhones.length === 0) {
      return new Response(
        JSON.stringify({
          warning: true,
          message: 'O telefone do candidato é inválido ou não há celulares válidos.',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // 4.1 Pré-verificação de números na UAZAPI (se endpoint estiver disponível)
    const verificationResults = await checkNumbersOnWhatsApp({
      baseUrl,
      instanceId,
      token: uazapiToken,
      numbers: validPhones,
    })

    // Se todos os números verificados não estiverem no WhatsApp, atualiza status do candidato
    const allCheckedNotOnWpp =
      validPhones.length > 0 &&
      validPhones.every(
        (p) => verificationResults[p] && verificationResults[p].isInWhatsapp === false,
      )

    if (allCheckedNotOnWpp) {
      await supabase
        .from('candidatos')
        .update({ whatsapp_status: 'nao_registrado' })
        .eq('id', candidato.id)
    } else if (validPhones.some((p) => verificationResults[p]?.isInWhatsapp === true)) {
      await supabase.from('candidatos').update({ whatsapp_status: 'valido' }).eq('id', candidato.id)
    }

    // 5. Função de envio via UAZAPI
    const sendWhatsAppWithRetry = async (
      phone: string,
      message: string,
      retries = 2,
      backoff = 1500,
    ): Promise<any> => {
      let numWpp = phone
      if (numWpp && !numWpp.startsWith('55')) {
        numWpp = '55' + numWpp
      }

      const fallbackText =
        (tituloTexto ? `*${tituloTexto}*\n\n` : '') +
        `${perguntaTexto}\n\n${template.footer_text || 'Escolha uma das opções abaixo'}\n- ${btnSimText}\n- ${btnNaoText}`

      let payloadsToTry: any[] = []

      if (isChatbot) {
        const menuBody: any = {
          number: numWpp,
          type: 'button',
          text: perguntaTexto,
          choices: [`${btnSimText}|sim`, `${btnNaoText}|nao`],
          footerText: template.footer_text || 'Escolha uma das opções abaixo',
        }
        if (tituloTexto) {
          menuBody.title = tituloTexto
        }

        payloadsToTry = [
          {
            url: `${baseUrl}/send/menu?instance=${instanceId}`,
            body: menuBody,
            type: 'interativa',
          },
          {
            url: `${baseUrl}/send/text?instance=${instanceId}`,
            body: { number: numWpp, text: fallbackText },
            type: 'fallback',
          },
        ]
      } else {
        payloadsToTry = [
          {
            url: `${baseUrl}/send/text?instance=${instanceId}`,
            body: { number: numWpp, text: message },
            type: 'texto',
          },
        ]
      }

      let lastErrorDetails = ''
      let lastStatus = 0

      for (let retry = 0; retry <= retries; retry++) {
        for (const attempt of payloadsToTry) {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 30000)

          try {
            const response = await fetch(attempt.url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Connection: 'keep-alive',
                apikey: uazapiToken,
                Authorization: `Bearer ${uazapiToken}`,
                token: uazapiToken,
              },
              body: JSON.stringify(attempt.body),
              signal: controller.signal,
            })
            clearTimeout(timeoutId)

            lastStatus = response.status

            if (response.ok) {
              const responseData = await response.json()
              if (
                responseData.error ||
                responseData.status === 'error' ||
                responseData.success === false
              ) {
                lastErrorDetails = extractUazapiErrorMessage(responseData)
                continue
              }
              return { ...responseData, _usedPayloadType: attempt.type }
            }

            const text = await response.text()
            lastErrorDetails = extractUazapiErrorMessage(text)
            console.error(
              `[enviar-whatsapp] API Error ${response.status} on ${attempt.url}: ${text}`,
            )

            // Se for erro definitivo de "not on WhatsApp" ou 400/404, não adianta tentar outro payload se for erro de número
            if (
              lastErrorDetails.toLowerCase().includes('not on whatsapp') ||
              lastErrorDetails.toLowerCase().includes('invalid number')
            ) {
              break
            }

            if (response.status === 405 || response.status === 404 || response.status === 400) {
              console.log(`[enviar-whatsapp] Fallback triggered due to status ${response.status}`)
              continue
            }
            if (response.status >= 500) {
              // Se a UazAPI deu 500 com corpo explicativo (ex: "the number ... is not on WhatsApp"), já temos o motivo real
              break
            }
          } catch (err: any) {
            clearTimeout(timeoutId)
            const isTransient =
              err.name === 'AbortError' ||
              err.message?.includes('timeout') ||
              err.message?.includes('broken pipe') ||
              err.message?.includes('fetch')
            if (!isTransient) {
              lastErrorDetails = err.message
            } else {
              lastErrorDetails = 'Timeout / Network Error'
              break
            }
          }
        }

        if (
          lastErrorDetails.toLowerCase().includes('not on whatsapp') ||
          lastErrorDetails.toLowerCase().includes('invalid number')
        ) {
          break
        }

        if (retry < retries) {
          await new Promise((resolve) => setTimeout(resolve, backoff))
          backoff *= 2
        }
      }

      const cleanReason = lastErrorDetails || `Erro de conexão (Status HTTP ${lastStatus})`
      throw new Error(cleanReason)
    }

    // 6. Iterar sobre cada número e enviar individualmente
    const attemptResults: Array<{
      phone: string
      success: boolean
      error?: string
    }> = []
    const errors: string[] = []
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    // Texto base gerado para esta mensagem (usado tanto no envio quanto na comparação de idempotência)
    // Para chatbot interativo, o texto principal é o título (se houver) + pergunta
    const generatedContent = isChatbot
      ? (tituloTexto ? `*${tituloTexto}*\n\n` : '') + perguntaTexto
      : mensagemTexto

    const normalizeForComparison = (str: string | null | undefined): string => {
      if (!str) return ''
      return str
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map((line) => line.trim())
        .join('\n')
        .trim()
    }

    const currentNormalized = normalizeForComparison(generatedContent)

    for (const phone of validPhones) {
      let isSuccess = false
      let errorMessage: string | null = null
      let externalId: string | null = null
      let responseData: any = null

      // Idempotency: verificar a última mensagem enviada com sucesso na última hora
      // Se o conteúdo for IDÊNTICO ao gerado atualmente -> pular por idempotência
      // Se o conteúdo for DIFERENTE (ex.: RH corrigiu template, data ou salário) -> permitir novo envio
      const { data: recentMsgs } = await supabase
        .from('mensagens_whatsapp')
        .select('id, status, conteudo, criado_em')
        .eq('candidato_id', candidato.id)
        .eq('numero_whatsapp', phone)
        .eq('etapa_id', etapa_id)
        .eq('template_id', template.id)
        .eq('direcao', 'enviada')
        .neq('status', 'falha')
        .gte('criado_em', oneHourAgo)
        .order('criado_em', { ascending: false })
        .limit(1)

      const lastSentMsg = recentMsgs && recentMsgs.length > 0 ? recentMsgs[0] : null

      if (lastSentMsg) {
        const lastNormalized = normalizeForComparison(lastSentMsg.conteudo)
        // Comparação estrita e tolerante a fallback com opções no rodapé
        const isIdentical =
          lastNormalized === currentNormalized ||
          (isChatbot && lastNormalized.startsWith(currentNormalized))

        if (isIdentical) {
          console.log(
            `[enviar-whatsapp] Mensagem com conteúdo idêntico já enviada para ${phone} na última hora (idempotência). Pulando.`,
          )
          continue
        } else {
          console.log(
            `[enviar-whatsapp] Conteúdo atualizado detectado para ${phone}. Permitindo reenvio legítimo.`,
          )
        }
      }

      // Se a pré-verificação já indicou que o número não está no WhatsApp, podemos marcar direto ou tentar envio
      const preCheck = verificationResults[phone]
      if (preCheck && preCheck.isInWhatsapp === false) {
        errorMessage = preCheck.error || `O número ${phone} não está registrado no WhatsApp`
      } else {
        try {
          responseData = await sendWhatsAppWithRetry(phone, mensagemTexto)
          isSuccess =
            responseData?.success === true || responseData?.status === 'success' || !!responseData
          if (!isSuccess) {
            errorMessage = extractUazapiErrorMessage(responseData)
          } else {
            externalId =
              responseData?.messageId ||
              responseData?.id ||
              responseData?.data?.id ||
              responseData?.message?.messageId ||
              null
          }
        } catch (error: any) {
          errorMessage = extractUazapiErrorMessage(error.message)
        }
      }

      let finalStatus = 'falha'
      let fallbackUsed = false
      if (isSuccess) {
        const usedType = responseData?._usedPayloadType
        if (usedType === 'fallback') {
          finalStatus = 'enviada (fallback)'
          fallbackUsed = true
        } else if (usedType === 'interativa') {
          finalStatus = 'enviada (interativa)'
        } else {
          finalStatus = 'enviada'
        }
      } else {
        const displayErr = formatUazapiErrorForDisplay(errorMessage || 'Falha no envio')
        errors.push(`${phone}: ${displayErr}`)
      }

      attemptResults.push({
        phone,
        success: isSuccess,
        error: errorMessage || undefined,
      })

      const convText =
        isChatbot && fallbackUsed
          ? (tituloTexto ? `*${tituloTexto}*\n\n` : '') +
            `${perguntaTexto}\n\n${template.footer_text || 'Escolha uma das opções abaixo'}\n- ${btnSimText}\n- ${btnNaoText}`
          : isChatbot
            ? (tituloTexto ? `*${tituloTexto}*\n\n` : '') + `${perguntaTexto}`
            : mensagemTexto

      // Individual logging per number com erro real gravado em erro_detalhe
      const { error: insertError } = await supabase.from('mensagens_whatsapp').insert({
        candidato_id: candidato.id,
        etapa_id: etapa_id,
        template_id: template.id,
        status: finalStatus,
        user_id: userId,
        numero_whatsapp: phone,
        enviado_em: isSuccess ? new Date().toISOString() : null,
        external_id: externalId,
        uazapi_message_id: externalId,
        conteudo: convText,
        direcao: 'enviada',
        tipo: isChatbot ? 'interativa' : 'texto',
        erro_detalhe: !isSuccess ? errorMessage : null,
      } as any)

      if (insertError) {
        console.error('Erro ao registrar a mensagem no banco de dados:', insertError.message)
      }
    }

    const successfulAttempts = attemptResults.filter((r) => r.success)
    const failedAttempts = attemptResults.filter((r) => !r.success)
    const totalPhones = attemptResults.length
    const allFailed = totalPhones > 0 && failedAttempts.length === totalPhones

    if (allFailed) {
      const primeiroErroFormatado = failedAttempts[0]?.error
        ? formatUazapiErrorForDisplay(failedAttempts[0].error)
        : 'Motivo não informado pela API'

      return new Response(
        JSON.stringify({
          error: true,
          all_failed: true,
          candidate_name: candidato.nome,
          message: `Todos os números de ${candidato.nome || 'o candidato'} falharam no WhatsApp — confira o telefone do candidato.`,
          detalhe: errors.join(' | '),
          motivo_real: primeiroErroFormatado,
          attempts: attemptResults,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    if (failedAttempts.length > 0) {
      return new Response(
        JSON.stringify({
          warning: true,
          all_failed: false,
          message: `Mensagem enviada com sucesso para ${successfulAttempts.length} número(s), mas falhou em ${failedAttempts.length}.`,
          detalhe: errors.join(' | '),
          attempts: attemptResults,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Mensagens enviadas com sucesso',
        attempts: attemptResults,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error: any) {
    console.error('Erro geral na Edge Function enviar-whatsapp:', error.message)
    return new Response(
      JSON.stringify({
        error: 'Ocorreu um erro interno no servidor ao processar o envio.',
        detalhe: error.message,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})

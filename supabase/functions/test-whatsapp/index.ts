import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import jwt from 'npm:jsonwebtoken'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: true, message: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')

    let userId = null
    if (token) {
      try {
        const decoded = jwt.decode(token) as any
        userId = decoded?.sub
      } catch (e) {
        console.log('Erro ao decodificar token:', e)
      }
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: true, message: 'Usuário não autenticado', detalhe: 'Token JWT ausente ou inválido.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const bodyText = await req.text()
    let body
    try {
      body = JSON.parse(bodyText)
    } catch (e) {
      return new Response(JSON.stringify({ error: true, message: 'Payload JSON inválido.', detalhe: 'Certifique-se de enviar um JSON válido.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { phone, template } = body

    if (!phone) {
      return new Response(JSON.stringify({ error: true, message: 'O número de telefone é obrigatório para o teste.', detalhe: 'Parâmetro "phone" ausente.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!template) {
      return new Response(JSON.stringify({ error: true, message: 'Os dados do template são obrigatórios.', detalhe: 'Parâmetro "template" ausente.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const uazapiUrl = Deno.env.get('UAZAPI_URL') || 'https://cvviasudeste.uazapi.com'
    const uazapiToken = Deno.env.get('UAZAPI_TOKEN') || Deno.env.get('UAZAPI_KEY') || ''

    if (!uazapiToken) {
      return new Response(JSON.stringify({ error: true, message: 'Configuração ausente: UAZAPI_TOKEN não encontrado.', detalhe: 'Erro de configuração do servidor.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const cleanPhone = phone.replace(/\D/g, '')
    let numWpp = cleanPhone
    if (numWpp && !numWpp.startsWith('55')) {
      numWpp = '55' + numWpp
    }

    const isChatbot = template.tipo === 'chatbot_interativo' || template.tipo === 'chatbot'

    if (isChatbot) {
      if (!template.pergunta_texto) {
        return new Response(JSON.stringify({ error: true, message: 'O corpo da mensagem é obrigatório para chatbots.', detalhe: 'Parâmetro "pergunta_texto" ausente.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (!template.botao_sim_texto || !template.botao_nao_texto) {
        return new Response(JSON.stringify({ error: true, message: 'Os textos dos botões são obrigatórios para chatbots.', detalhe: 'Parâmetros de botão ausentes.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }
    
    let message = template.texto || 'Teste de Mensagem Simples'
    message = message.replace(/{{nome}}/gi, 'Candidato')
    message = message.replace(/{{nome_candidato}}/gi, 'Candidato')
    message = message.replace(/{{vaga}}/gi, 'Vaga de Teste')
    message = message.replace(/{{nome_vaga}}/gi, 'Vaga de Teste')
    message = message.replace(/{nome_candidato}/gi, 'Candidato')
    message = message.replace(/{nome_vaga}/gi, 'Vaga de Teste')

    let tituloTexto = template.titulo_texto || ''
    tituloTexto = tituloTexto.replace(/{{nome}}/gi, 'Candidato')
    tituloTexto = tituloTexto.replace(/{{nome_candidato}}/gi, 'Candidato')
    tituloTexto = tituloTexto.replace(/{{vaga}}/gi, 'Vaga de Teste')
    tituloTexto = tituloTexto.replace(/{{nome_vaga}}/gi, 'Vaga de Teste')

    let perguntaTexto = template.pergunta_texto || template.texto || 'Teste de Chatbot: Você confirma?'
    perguntaTexto = perguntaTexto.replace(/{{nome}}/gi, 'Candidato')
    perguntaTexto = perguntaTexto.replace(/{{nome_candidato}}/gi, 'Candidato')
    perguntaTexto = perguntaTexto.replace(/{{vaga}}/gi, 'Vaga de Teste')
    perguntaTexto = perguntaTexto.replace(/{{nome_vaga}}/gi, 'Vaga de Teste')
    perguntaTexto = perguntaTexto.replace(/{nome_candidato}/gi, 'Candidato')
    perguntaTexto = perguntaTexto.replace(/{nome_vaga}/gi, 'Vaga de Teste')

    let baseUrl = uazapiUrl.endsWith('/') ? uazapiUrl.slice(0, -1) : uazapiUrl
    if (baseUrl.startsWith('http://') && !baseUrl.includes('localhost')) {
      baseUrl = baseUrl.replace('http://', 'https://')
    }

    const instanceId = Deno.env.get('UAZAPI_INSTANCE_ID') || Deno.env.get('UAZAPI_INSTANCE') || Deno.env.get('INSTANCE_ID') || 'cvviasudeste'
    
    const btnSimText = (template.botao_sim_texto || 'Sim').substring(0, 20)
    const btnNaoText = (template.botao_nao_texto || 'Não').substring(0, 20)

    let payloadsToTry: any[] = []

    if (isChatbot) {
      const fallbackText = (tituloTexto ? `*${tituloTexto}*\n\n` : '') + `${perguntaTexto}\n\nResponda com:\n- ${btnSimText}\n- ${btnNaoText}`
      const menuBody: any = {
        number: numWpp,
        type: "button",
        text: perguntaTexto,
        choices: [`${btnSimText}|sim`, `${btnNaoText}|nao`],
        footerText: template.footer_text || "Escolha uma das opções abaixo"
      }
      if (tituloTexto) {
        menuBody.title = tituloTexto
      }
      
      payloadsToTry = [
        {
          url: `${baseUrl}/send/menu?instance=${instanceId}`,
          body: menuBody,
          type: "interativa"
        },
        {
          url: `${baseUrl}/send/text?instance=${instanceId}`,
          body: { number: numWpp, text: fallbackText },
          type: "fallback"
        }
      ]
    } else {
      payloadsToTry = [
        {
          url: `${baseUrl}/send/text?instance=${instanceId}`,
          body: { number: numWpp, text: message },
          type: "texto"
        }
      ]
    }

    let successData: any = null
    let lastErrorDetails = ''
    let lastStatus = 0
    const maxRetries = 2
    
    outerLoop:
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      for (const payloadVariant of payloadsToTry) {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000)

        const startTime = Date.now()
        try {
          const response = await fetch(payloadVariant.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Connection': 'keep-alive',
              'apikey': uazapiToken,
              'Authorization': `Bearer ${uazapiToken}`,
              'token': uazapiToken
            },
            body: JSON.stringify(payloadVariant.body),
            signal: controller.signal
          })
          clearTimeout(timeoutId)
          const duration = Date.now() - startTime
          console.log(`[test-whatsapp] Attempt ${attempt + 1}: ${payloadVariant.url} took ${duration}ms with status ${response.status}`)
          
          lastStatus = response.status

          if (response.ok) {
            const json = await response.json()
            if (json.error || json.status === 'error' || json.success === false) {
               lastErrorDetails = JSON.stringify(json)
               continue // Trata como falha de API para tentar o próximo payload
            }
            successData = { ...json, _usedPayloadType: payloadVariant.type }
            break outerLoop
          }

          const textBody = await response.text()
          lastErrorDetails = textBody
          console.error(`[test-whatsapp] API Error ${response.status} on ${payloadVariant.url}: ${textBody}`)

          if (response.status === 405 || response.status === 404 || response.status === 400) {
            console.log(`[test-whatsapp] Fallback triggered due to status ${response.status}`);
            continue
          }

          if (response.status >= 500 && attempt < maxRetries) {
            console.log(`[test-whatsapp] Server error ${response.status}, retrying...`)
            break // Volta para o outerLoop e tenta novamente após o delay
          }

        } catch (fetchError: any) {
          clearTimeout(timeoutId)
          const duration = Date.now() - startTime
          const errorMsg = fetchError.message || String(fetchError)
          console.log(`[test-whatsapp] Failed after ${duration}ms on ${payloadVariant.url}`, errorMsg)
          
          const isNetworkOrTimeout = fetchError.name === 'AbortError' || 
            errorMsg.toLowerCase().includes('timeout') || 
            errorMsg.toLowerCase().includes('broken pipe') || 
            errorMsg.toLowerCase().includes('reset') || 
            errorMsg.toLowerCase().includes('econnreset') || 
            errorMsg.toLowerCase().includes('fetch')

          if (isNetworkOrTimeout) {
            lastErrorDetails = 'A requisição excedeu o tempo limite (Timeout) ou ocorreu erro de rede.'
            break // Sai do loop de payloads, cai no if de delay do retry
          }
          
          lastErrorDetails = errorMsg
        }
      }
      
      if (attempt < maxRetries) {
        await new Promise(res => setTimeout(res, 2000))
      }
    }

    if (successData) {
      return new Response(JSON.stringify(successData), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ 
      error: true, 
      message: `Erro na comunicação com a API do WhatsApp (Status: ${lastStatus || 'Desconhecido'})`,
      detalhe: lastErrorDetails || 'Nenhuma das rotas de endpoint funcionou.',
      originalStatus: lastStatus
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: true, message: 'Erro na execução da função Edge', detalhe: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

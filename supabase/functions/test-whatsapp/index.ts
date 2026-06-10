import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import jwt from 'npm:jsonwebtoken'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

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

    const uazapiUrl = Deno.env.get('UAZAPI_URL') || 'https://api.uazapi.com'
    const uazapiToken = Deno.env.get('UAZAPI_TOKEN') || Deno.env.get('UAZAPI_KEY') || ''

    if (!uazapiToken) {
      console.log('Aviso: UAZAPI_TOKEN não configurada. Simulando sucesso.')
      return new Response(JSON.stringify({ success: true, simulated: true, detalhe: 'Token ausente. Teste simulado.' }), {
        status: 200,
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
        return new Response(JSON.stringify({ error: true, message: 'O texto da pergunta é obrigatório para chatbots.', detalhe: 'Parâmetro "pergunta_texto" ausente.' }), {
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

    const instanceId = Deno.env.get('UAZAPI_INSTANCE_ID') || Deno.env.get('UAZAPI_INSTANCE') || Deno.env.get('INSTANCE_ID') || ''
    
    const endpointStr = isChatbot ? '/message/sendButtons' : '/message/sendText'
    const endpoint = instanceId ? `${endpointStr}/${instanceId}` : endpointStr
    const apiUrl = new URL(`${baseUrl}${endpoint}`)
    
    if (instanceId) {
      apiUrl.searchParams.append('instance_id', instanceId)
      apiUrl.searchParams.append('instance', instanceId)
    }

    let payload_body: any = {
      number: numWpp || "",
      text: message || "",
    }

    if (isChatbot) {
      payload_body = {
        number: numWpp || "",
        title: message || "",
        description: perguntaTexto || "",
        footer: "Responda clicando em um dos botões abaixo",
        buttons: [
          { 
            buttonId: "sim_action", 
            buttonText: { displayText: (template.botao_sim_texto || 'Sim').substring(0, 20) }
          },
          { 
            buttonId: "nao_action", 
            buttonText: { displayText: (template.botao_nao_texto || 'Não').substring(0, 20) }
          }
        ]
      }
    }

    let response: Response | undefined;
    const maxRetries = 2;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s timeout

      const startTime = Date.now()
      try {
        response = await fetch(apiUrl.toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Connection': 'keep-alive',
            apikey: uazapiToken,
            token: uazapiToken,
            ...(instanceId ? { instance_id: instanceId, instance: instanceId } : {})
          },
          body: JSON.stringify(payload_body),
          signal: controller.signal
        })
        clearTimeout(timeoutId)
        const duration = Date.now() - startTime
        console.log(`[test-whatsapp] Attempt ${attempt + 1}: Request took ${duration}ms with status ${response.status}`)
        
        // Log específico para 405 exigido no Acceptance Criteria
        if (response.status === 405) {
          console.error(`[test-whatsapp] 405 Method Not Allowed. URL: ${apiUrl.toString()}, Method: POST, Endpoint: ${endpoint}`)
        }

        if (response.status >= 500 && response.status < 600 && attempt < maxRetries) {
          console.log(`[test-whatsapp] Server error ${response.status}, retrying...`)
          await new Promise(res => setTimeout(res, 2000))
          continue
        }

        break;
      } catch (fetchError: any) {
        clearTimeout(timeoutId)
        const duration = Date.now() - startTime
        const errorMsg = fetchError.message || String(fetchError)
        console.log(`[test-whatsapp] Attempt ${attempt + 1} failed after ${duration}ms`, errorMsg)
        
        const isNetworkOrTimeout = fetchError.name === 'AbortError' || 
          errorMsg.toLowerCase().includes('timeout') || 
          errorMsg.toLowerCase().includes('broken pipe') || 
          errorMsg.toLowerCase().includes('reset') || 
          errorMsg.toLowerCase().includes('econnreset') || 
          errorMsg.toLowerCase().includes('fetch');

        if (isNetworkOrTimeout && attempt < maxRetries) {
          console.log(`[test-whatsapp] Network/Timeout error, retrying...`)
          await new Promise(res => setTimeout(res, 2000))
          continue
        }

        if (attempt === maxRetries) {
          if (fetchError.name === 'AbortError' || errorMsg.toLowerCase().includes('timeout')) {
            return new Response(JSON.stringify({ 
              error: true, 
              message: 'Connection to WhatsApp provider failed', 
              detalhe: 'A requisição excedeu o tempo limite (Timeout de 30s).' 
            }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }

          if (errorMsg.toLowerCase().includes('broken pipe') || errorMsg.toLowerCase().includes('reset') || errorMsg.toLowerCase().includes('econnreset') || errorMsg.toLowerCase().includes('fetch')) {
            return new Response(JSON.stringify({ 
              error: true, 
              message: 'Connection to WhatsApp provider failed', 
              detalhe: errorMsg 
            }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }

          return new Response(JSON.stringify({ 
            error: true, 
            message: 'Erro interno na comunicação com o provedor WhatsApp', 
            detalhe: errorMsg 
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }
    }

    if (!response || !response.ok) {
      let errorDetails = ''
      
      // Lê o texto antes do JSON para evitar runtime crashes caso a API retorne HTML ou Nginx Gateway Timeouts
      if (response) {
        try {
          const textBody = await response.text()
          try {
            const errJson = JSON.parse(textBody)
            errorDetails = errJson.message || errJson.error || JSON.stringify(errJson)
          } catch (parseErr) {
            errorDetails = textBody
          }
        } catch (readErr) {
          errorDetails = 'Não foi possível ler o corpo da resposta do servidor.'
        }
      }
      
      // Retorna HTTP 200 para evitar exception genérica do supabase.functions.invoke e preservar a mensagem real
      return new Response(JSON.stringify({ 
        error: true, 
        message: `Erro na API do WhatsApp (${response?.status || 'Unknown'})`,
        detalhe: errorDetails || response?.statusText || 'Falha na comunicação com a API.',
        originalStatus: response?.status
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const data = await response.json()

    if (data.error || data.status === 'error' || data.success === false) {
      return new Response(JSON.stringify({ 
        error: true, 
        message: 'Erro reportado pela API do WhatsApp',
        detalhe: data.message || data.error || JSON.stringify(data)
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify(data), {
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

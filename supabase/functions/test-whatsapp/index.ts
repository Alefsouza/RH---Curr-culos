import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import jwt from 'npm:jsonwebtoken'

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
      return new Response(
        JSON.stringify({
          error: true,
          message: 'Usuário não autenticado',
          detalhe: 'Token JWT ausente ou inválido.',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const bodyText = await req.text()
    let body
    try {
      body = JSON.parse(bodyText)
    } catch (e) {
      return new Response(
        JSON.stringify({
          error: true,
          message: 'Payload JSON inválido.',
          detalhe: 'Certifique-se de enviar um JSON válido.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const { phone, template } = body

    if (!phone) {
      return new Response(
        JSON.stringify({
          error: true,
          message: 'O número de telefone é obrigatório para o teste.',
          detalhe: 'Parâmetro "phone" ausente.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    if (!template) {
      return new Response(
        JSON.stringify({
          error: true,
          message: 'Os dados do template são obrigatórios.',
          detalhe: 'Parâmetro "template" ausente.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const uazapiUrl = Deno.env.get('UAZAPI_URL') || 'https://api.uazapi.com'
    const uazapiToken = Deno.env.get('UAZAPI_TOKEN') || Deno.env.get('UAZAPI_KEY') || ''

    if (!uazapiToken) {
      console.log('Aviso: UAZAPI_TOKEN não configurada. Simulando sucesso.')
      return new Response(
        JSON.stringify({
          success: true,
          simulated: true,
          detalhe: 'Token ausente. Teste simulado.',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const cleanPhone = phone.replace(/\D/g, '')
    let numWpp = cleanPhone
    if (numWpp && !numWpp.startsWith('55')) {
      numWpp = '55' + numWpp
    }

    const isChatbot = template.tipo === 'chatbot_interativo' || template.tipo === 'chatbot'

    let message = isChatbot
      ? template.pergunta_texto || template.texto || 'Teste de Chatbot: Você confirma?'
      : template.texto || 'Teste de Mensagem Simples'

    message = message.replace(/{{nome_candidato}}/gi, 'Candidato Teste')
    message = message.replace(/{{nome_vaga}}/gi, 'Vaga Teste')

    let baseUrl = uazapiUrl.endsWith('/') ? uazapiUrl.slice(0, -1) : uazapiUrl
    if (baseUrl.startsWith('http://') && !baseUrl.includes('localhost')) {
      baseUrl = baseUrl.replace('http://', 'https://')
    }

    const instanceId =
      Deno.env.get('UAZAPI_INSTANCE_ID') ||
      Deno.env.get('UAZAPI_INSTANCE') ||
      Deno.env.get('INSTANCE_ID') ||
      ''
    const endpointStr = isChatbot ? '/message/sendInteractive' : '/message/sendText'
    const endpoint = instanceId ? `${endpointStr}/${instanceId}` : endpointStr
    const apiUrl = `${baseUrl}${endpoint}`

    let payload_body: any = {
      number: numWpp,
      text: message,
    }

    if (isChatbot) {
      payload_body = {
        number: numWpp,
        options: { delay: 1200 },
        interactiveMessage: {
          type: 'button',
          body: { text: message },
          footer: { text: 'Via Sudeste' },
          action: {
            buttons: [
              {
                type: 'reply',
                reply: {
                  id: 'sim_teste',
                  title: (template.botao_sim_texto || 'Sim').substring(0, 20),
                },
              },
              {
                type: 'reply',
                reply: {
                  id: 'nao_teste',
                  title: (template.botao_nao_texto || 'Não').substring(0, 20),
                },
              },
            ],
          },
        },
      }
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: uazapiToken,
        token: uazapiToken,
        ...(instanceId ? { instance_id: instanceId } : {}),
      },
      body: JSON.stringify(payload_body),
    })

    if (!response.ok) {
      let errorDetails = ''
      try {
        const errJson = await response.json()
        errorDetails = errJson.message || errJson.error || JSON.stringify(errJson)
      } catch (e) {
        try {
          errorDetails = await response.text()
        } catch (e2) {}
      }

      return new Response(
        JSON.stringify({
          error: true,
          message: `Erro na API do WhatsApp (${response.status})`,
          detalhe: errorDetails || response.statusText || 'Falha na comunicação com a API.',
        }),
        {
          status: response.status >= 400 && response.status < 600 ? response.status : 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const data = await response.json()

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: true,
        message: 'Erro na execução da função Edge',
        detalhe: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})

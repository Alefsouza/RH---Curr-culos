import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

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
    let body
    try {
      body = JSON.parse(bodyText)
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Payload inválido.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { phone, template } = body

    if (!phone || !template) {
      return new Response(JSON.stringify({ error: 'phone e template são obrigatórios.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const uazapiUrl = Deno.env.get('UAZAPI_URL') || 'https://api.uazapi.com'
    const uazapiToken = Deno.env.get('UAZAPI_TOKEN') || Deno.env.get('UAZAPI_KEY') || ''

    if (!uazapiToken) {
      console.log('Aviso: UAZAPI_TOKEN não configurada. Simulando sucesso.')
      return new Response(JSON.stringify({ success: true, simulated: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const cleanPhone = phone.replace(/\D/g, '')
    let numWpp = cleanPhone
    if (numWpp.startsWith('55') && numWpp.length >= 12) {
      numWpp = numWpp.substring(2)
    }

    const isChatbot = template.tipo === 'chatbot_interativo'
    let message = isChatbot ? template.pergunta_texto : template.texto

    if (message) {
      message = message.replace(/{{nome_candidato}}/gi, 'Candidato Teste')
      message = message.replace(/{{nome_vaga}}/gi, 'Vaga Teste')
    }

    const baseUrl = uazapiUrl.endsWith('/') ? uazapiUrl.slice(0, -1) : uazapiUrl
    const endpoint = isChatbot ? '/send/buttons' : '/send/text'
    const apiUrl = `${baseUrl}${endpoint}`

    let payload_body: any = {
      number: numWpp,
      text: message,
    }

    if (isChatbot) {
      payload_body = {
        number: numWpp,
        options: { delay: 1200 },
        buttonMessage: {
          text: message,
          footerText: "Via Sudeste",
          buttons: [
            { type: "reply", reply: { id: `sim_teste`, title: (template.botao_sim_texto || 'Sim').substring(0, 20) } },
            { type: "reply", reply: { id: `nao_teste`, title: (template.botao_nao_texto || 'Não').substring(0, 20) } }
          ]
        }
      }
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: uazapiToken,
        token: uazapiToken,
      },
      body: JSON.stringify(payload_body),
    })

    if (!response.ok) {
      let errorDetails = ''
      try {
        errorDetails = await response.text()
      } catch (e) {}
      throw new Error(`Erro na API do WhatsApp: ${response.status} - ${errorDetails}`)
    }

    const data = await response.json()

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: true, detalhe: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

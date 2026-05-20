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

    const { phone, message } = body

    if (!phone || !message) {
      return new Response(JSON.stringify({ error: 'phone e message são obrigatórios.' }), {
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

    const baseUrl = uazapiUrl.endsWith('/') ? uazapiUrl.slice(0, -1) : uazapiUrl
    const apiUrl = `${baseUrl}/send/text`
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: uazapiToken,
        token: uazapiToken,
      },
      body: JSON.stringify({
        number: numWpp,
        text: message,
      }),
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

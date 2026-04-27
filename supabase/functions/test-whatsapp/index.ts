import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'

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
    const uazapiKey = Deno.env.get('UAZAPI_KEY') || ''
    const instanceId = Deno.env.get('UAZAPI_INSTANCE_ID') || ''

    if (!uazapiKey) {
      console.log('Aviso: UAZAPI_KEY não configurada. Simulando sucesso.')
      return new Response(JSON.stringify({ success: true, simulated: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const cleanPhone = phone.replace(/\D/g, '')
    let formattedPhone = cleanPhone
    if (formattedPhone.length <= 11) {
      formattedPhone = '55' + formattedPhone
    }

    const apiUrl = `${uazapiUrl}/api/send-message`
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${uazapiKey}`,
      },
      body: JSON.stringify({
        phone: formattedPhone,
        message: message,
        instance_id: instanceId,
      }),
    })

    if (!response.ok) {
      throw new Error(`Erro na API do WhatsApp: ${response.status}`)
    }

    const data = await response.json()

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

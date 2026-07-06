import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import jwt from 'npm:jsonwebtoken'
import { corsHeaders } from '../_shared/cors.ts'

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
        userId = decoded?.sub ?? null
      } catch (e) {
        console.log('Erro ao decodificar token:', e)
      }
    }

    if (!userId) {
      return new Response(JSON.stringify({ success: false, message: 'Usuário não autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let body: any
    try {
      body = JSON.parse(await req.text())
    } catch {
      return new Response(
        JSON.stringify({ success: false, message: 'Payload inválido. Formato JSON esperado.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const { candidato_id, telefone, mensagem } = body as {
      candidato_id: string | null
      telefone: string
      mensagem: string
    }

    if (!mensagem || !mensagem.trim()) {
      return new Response(JSON.stringify({ success: false, message: 'Mensagem é obrigatória.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!telefone) {
      return new Response(
        JSON.stringify({ success: false, message: 'Telefone do destinatário é obrigatório.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    let cleanPhone = telefone.replace(/\D/g, '')
    if (cleanPhone && !cleanPhone.startsWith('55')) {
      cleanPhone = '55' + cleanPhone
    }

    if (cleanPhone.length < 12 || cleanPhone.length > 15) {
      return new Response(JSON.stringify({ success: false, message: 'Telefone inválido.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const uazapiUrl = Deno.env.get('UAZAPI_URL') || 'https://cvviasudeste.uazapi.com'
    const uazapiToken = Deno.env.get('UAZAPI_TOKEN') || Deno.env.get('UAZAPI_KEY') || ''
    const instanceId =
      Deno.env.get('UAZAPI_INSTANCE_ID') ||
      Deno.env.get('UAZAPI_INSTANCE') ||
      Deno.env.get('INSTANCE_ID') ||
      'cvviasudeste'

    if (!uazapiToken) {
      return new Response(
        JSON.stringify({ success: false, message: 'Configuração UAZAPI ausente.' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    let baseUrl = uazapiUrl.endsWith('/') ? uazapiUrl.slice(0, -1) : uazapiUrl
    if (baseUrl.startsWith('http://') && !baseUrl.includes('localhost')) {
      baseUrl = baseUrl.replace('http://', 'https://')
    }

    const sendUrl = `${baseUrl}/send/text?instance=${instanceId}`
    let externalId: string | null = null
    let sendSuccess = false

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)
      const response = await fetch(sendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Connection: 'keep-alive',
          apikey: uazapiToken,
          Authorization: `Bearer ${uazapiToken}`,
          token: uazapiToken,
        },
        body: JSON.stringify({ number: cleanPhone, text: mensagem }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (response.ok) {
        const responseData = await response.json()
        if (
          !responseData.error &&
          responseData.status !== 'error' &&
          responseData.success !== false
        ) {
          sendSuccess = true
          externalId =
            responseData.messageId ||
            responseData.id ||
            responseData.data?.id ||
            responseData.message?.messageId ||
            null
        }
      }
    } catch (err: any) {
      console.error('Erro ao enviar via UAZAPI:', err.message)
    }

    const { data: insertData, error: insertError } = await supabase
      .from('mensagens_whatsapp')
      .insert({
        candidato_id: candidato_id || null,
        conteudo: mensagem,
        direcao: 'enviada',
        user_id: userId,
        numero_whatsapp: cleanPhone,
        enviado_em: sendSuccess ? new Date().toISOString() : null,
        external_id: externalId,
        uazapi_message_id: externalId,
        status: sendSuccess ? 'enviada' : 'falha',
        tipo: 'texto',
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Erro ao registrar mensagem:', insertError.message)
      return new Response(
        JSON.stringify({ success: false, message: 'Erro ao salvar mensagem no banco.' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    if (!sendSuccess) {
      return new Response(
        JSON.stringify({
          success: false,
          message:
            'Falha ao enviar mensagem via WhatsApp. Mensagem registrada com status de falha.',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    return new Response(JSON.stringify({ success: true, messageId: insertData?.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Erro geral na Edge Function enviar-mensagem-direta:', error.message)
    return new Response(JSON.stringify({ success: false, message: 'Erro interno no servidor.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

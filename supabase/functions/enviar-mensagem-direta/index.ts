import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
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
      telefone: string | string[]
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

    // Normalização de múltiplos telefones (separados por vírgula, barra ou array)
    const rawList: string[] = Array.isArray(telefone)
      ? telefone
      : String(telefone)
          .split(/[,;\n/]+/)
          .map((t) => t.trim())
          .filter(Boolean)

    const validPhones: string[] = []
    const seen = new Set<string>()

    for (const item of rawList) {
      let clean = item.replace(/\D/g, '')
      if (!clean) continue
      if (!clean.startsWith('55')) {
        clean = '55' + clean
      }
      if (clean.length >= 12 && clean.length <= 15) {
        if (!seen.has(clean)) {
          seen.add(clean)
          validPhones.push(clean)
        }
      }
    }

    if (validPhones.length === 0) {
      return new Response(JSON.stringify({ success: false, message: 'Telefone inválido.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

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

    const results: Array<{
      phone: string
      success: boolean
      messageId?: string | null
      error?: string
    }> = []

    for (const phone of validPhones) {
      let externalId: string | null = null
      let sendSuccess = false
      let sendError: string | null = null

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
          body: JSON.stringify({ number: phone, text: mensagem }),
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
          } else {
            sendError = JSON.stringify(responseData)
          }
        } else {
          sendError = await response.text()
        }
      } catch (err: any) {
        sendError = err.message
        console.error(`Erro ao enviar via UAZAPI para ${phone}:`, err.message)
      }

      const { data: insertData, error: insertError } = await supabase
        .from('mensagens_whatsapp')
        .insert({
          candidato_id: candidato_id || null,
          conteudo: mensagem,
          direcao: 'enviada',
          user_id: userId,
          numero_whatsapp: phone,
          enviado_em: sendSuccess ? new Date().toISOString() : null,
          external_id: externalId,
          uazapi_message_id: externalId,
          status: sendSuccess ? 'enviada' : 'falha',
          tipo: 'texto',
        })
        .select('id')
        .single()

      if (insertError) {
        console.error('Erro ao registrar mensagem no banco:', insertError.message)
      }

      results.push({
        phone,
        success: sendSuccess,
        messageId: insertData?.id || externalId,
        error: sendError || (insertError ? insertError.message : undefined),
      })
    }

    const anySuccess = results.some((r) => r.success)
    const firstSuccessful = results.find((r) => r.success)

    if (!anySuccess) {
      return new Response(
        JSON.stringify({
          success: false,
          message:
            'Falha ao enviar mensagem via WhatsApp. Mensagem registrada com status de falha.',
          results,
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
        messageId: firstSuccessful?.messageId,
        results,
        phones: validPhones,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error: any) {
    console.error('Erro geral na Edge Function enviar-mensagem-direta:', error.message)
    return new Response(JSON.stringify({ success: false, message: 'Erro interno no servidor.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

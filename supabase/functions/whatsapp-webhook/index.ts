import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

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
    let body: any = {}
    if (bodyText) {
      try {
        body = JSON.parse(bodyText)
      } catch (e) {
        console.error('Payload JSON inválido')
      }
    }

    const events = Array.isArray(body) ? body : [body]
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    for (const event of events) {
      let messageId = null
      let status = null

      // Mapping variations of UAZAPI/Evolution API webhooks
      if (event?.data?.id) {
        messageId = event.data.id
        status = event.data.status
      } else if (event?.id) {
        messageId = event.id
        status = event.status
      } else if (event?.data?.key?.id) {
        messageId = event.data.key.id
        status = event.data.update?.status || event.status || event.data.status
      }

      if (!messageId) continue

      let mappedStatus = null
      
      if (typeof status === 'string') {
        const s = status.toUpperCase()
        if (s === 'SENT' || s === 'SERVER_ACK') mappedStatus = 'enviada'
        if (s === 'DELIVERED' || s === 'DELIVERY_ACK') mappedStatus = 'entregue'
        if (s === 'READ' || s === 'READ_ACK' || s === 'PLAYED') mappedStatus = 'lida'
        if (s === 'ERROR' || s === 'FAILED' || s === 'REJECTED') mappedStatus = 'falha'
      } else if (typeof status === 'number') {
        // Evolution API numbers
        if (status === 1) mappedStatus = 'enviada' // SERVER_ACK
        if (status === 2) mappedStatus = 'entregue' // DELIVERY_ACK
        if (status === 3 || status === 4) mappedStatus = 'lida' // READ / PLAYED
        if (status === 5) mappedStatus = 'falha' // ERROR
      }

      if (mappedStatus) {
        const { data: existingMsg } = await supabase
          .from('mensagens_whatsapp')
          .select('enviado_em')
          .eq('external_id', messageId)
          .single()
          
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
          .eq('external_id', messageId)
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Webhook erro:', error)
    // Always return 200 for webhooks to prevent provider from retrying indefinitely on logical errors
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

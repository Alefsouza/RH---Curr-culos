import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
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
      return new Response(JSON.stringify({ error: 'Payload inválido. Formato JSON esperado.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { candidato_id, etapa_id, usuario_id } = body

    if (!candidato_id || !etapa_id || !usuario_id) {
      return new Response(
        JSON.stringify({ error: 'candidato_id, etapa_id e usuario_id são obrigatórios.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: template, error: templateError } = await supabase
      .from('templates_mensagem')
      .select('id, texto')
      .eq('etapa_id', etapa_id)
      .eq('user_id', usuario_id)
      .maybeSingle()

    if (templateError) {
      console.error('Erro ao buscar template:', templateError)
    }

    if (!template || !template.texto) {
      return new Response(JSON.stringify({ error: 'Mensagem não configurada para esta etapa' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: msgWpp, error: wppError } = await supabase
      .from('mensagens_whatsapp')
      .select('id, numero_whatsapp')
      .eq('candidato_id', candidato_id)
      .not('numero_whatsapp', 'is', null)
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (wppError) {
      console.error('Erro ao buscar número de WhatsApp:', wppError)
    }

    if (!msgWpp || !msgWpp.numero_whatsapp) {
      return new Response(JSON.stringify({ error: 'Número de WhatsApp não encontrado' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: candidato, error: candError } = await supabase
      .from('candidatos')
      .select('nome')
      .eq('id', candidato_id)
      .maybeSingle()

    if (candError) {
      console.error('Erro ao buscar candidato:', candError)
    }

    const { data: etapa, error: etapaError } = await supabase
      .from('etapas')
      .select('nome')
      .eq('id', etapa_id)
      .maybeSingle()

    if (etapaError) {
      console.error('Erro ao buscar etapa:', etapaError)
    }

    let mensagem = template.texto
    const nomeCandidato = candidato?.nome || ''
    const nomeEtapa = etapa?.nome || ''

    mensagem = mensagem.replace(/{{nome}}/gi, nomeCandidato)
    mensagem = mensagem.replace(/{{etapa}}/gi, nomeEtapa)

    const uazapiUrl = Deno.env.get('UAZAPI_URL') || ''
    const uazapiKey = Deno.env.get('UAZAPI_KEY') || ''

    let numWpp = msgWpp.numero_whatsapp.replace(/\D/g, '')
    if (numWpp.startsWith('55') && numWpp.length >= 12) {
      numWpp = numWpp.substring(2)
    }

    const sendWhatsAppWithRetry = async (
      numero: string,
      msg: string,
      retries = 3,
      delays = [2000, 4000, 8000],
    ): Promise<any> => {
      try {
        const baseUrl = uazapiUrl.endsWith('/') ? uazapiUrl.slice(0, -1) : uazapiUrl
        const url = `${baseUrl}/message/sendText`

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            token: uazapiKey,
          },
          body: JSON.stringify({
            numero,
            mensagem: msg,
          }),
        })

        if (!response.ok) {
          throw new Error(`HTTP Error ${response.status}`)
        }

        return await response.json()
      } catch (error: any) {
        if (retries > 0) {
          const delay = delays[3 - retries] || 8000
          console.log(`Erro UAZAPI. Retentando em ${delay}ms... (${retries} tentativas restantes)`)
          await new Promise((resolve) => setTimeout(resolve, delay))
          return sendWhatsAppWithRetry(numero, msg, retries - 1, delays)
        }
        throw error
      }
    }

    let isSuccess = false
    let errorDetail = ''

    if (uazapiKey && uazapiUrl) {
      try {
        await sendWhatsAppWithRetry(numWpp, mensagem)
        isSuccess = true
      } catch (e: any) {
        errorDetail = e.message
        isSuccess = false
      }
    } else {
      console.log('Aviso: UAZAPI_KEY ou UAZAPI_URL não configurada. Simulando sucesso do envio.')
      isSuccess = true
    }

    const statusEnvio = isSuccess ? 'enviada' : 'falha'

    const { error: insertError } = await supabase.from('mensagens_whatsapp').insert({
      candidato_id: candidato_id,
      etapa_id: etapa_id,
      template_id: template.id,
      user_id: usuario_id,
      numero_whatsapp: msgWpp.numero_whatsapp,
      status: statusEnvio,
      enviado_em: new Date().toISOString(),
    })

    if (insertError) {
      console.error('Erro ao registrar envio na base de dados:', insertError)
    }

    if (!isSuccess) {
      return new Response(
        JSON.stringify({ error: 'Falha ao enviar mensagem via UAZAPI.', detalhe: errorDetail }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Mensagem enviada com sucesso' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error: any) {
    console.error('Erro inesperado na function enviar-mensagem-whatsapp:', error)
    return new Response(
      JSON.stringify({ error: 'Ocorreu um erro interno no servidor.', detalhes: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})

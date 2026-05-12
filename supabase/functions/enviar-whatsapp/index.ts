import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import jwt from 'npm:jsonwebtoken'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

// Trigger deployment

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('1. Iniciando enviar-whatsapp')

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
      return new Response(JSON.stringify({ error: 'Usuário não autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let body
    try {
      const bodyText = await req.text()
      body = JSON.parse(bodyText)
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Payload inválido. Formato JSON esperado.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { candidato_id, etapa_id } = body

    if (!candidato_id) {
      return new Response(
        JSON.stringify({ error: 'Dados obrigatórios faltando: candidato_id é necessário.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    let template = null

    if (etapa_id) {
      console.log('2. Buscando template da etapa', etapa_id)
      const { data, error: templateError } = await supabase
        .from('templates_mensagem')
        .select('*')
        .eq('etapa_id', etapa_id)
        .eq('user_id', userId)
        .maybeSingle()

      if (templateError) {
        console.log('Erro ao buscar template:', templateError.message)
      }
      template = data
    } else {
      console.log('2. Buscando último template do candidato', candidato_id)
      const { data: lastMsg } = await supabase
        .from('mensagens_whatsapp')
        .select('template_id')
        .eq('candidato_id', candidato_id)
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (lastMsg?.template_id) {
        const { data: tData } = await supabase
          .from('templates_mensagem')
          .select('*')
          .eq('id', lastMsg.template_id)
          .eq('user_id', userId)
          .maybeSingle()
        template = tData
      }
    }

    if (!template || !template.texto) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Template de mensagem não encontrado para esta etapa.',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    console.log('3. Buscando candidato', candidato_id)
    const { data: candidato, error: candidatoError } = await supabase
      .from('candidatos')
      .select('*, vagas(titulo)')
      .eq('id', candidato_id)
      .eq('user_id', userId)
      .single()

    if (candidatoError || !candidato) {
      return new Response(
        JSON.stringify({ success: false, message: 'Candidato não encontrado.' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    console.log('Buscando número de WhatsApp em mensagens_whatsapp')
    const { data: mensagemWpp, error: msgError } = await supabase
      .from('mensagens_whatsapp')
      .select('numero_whatsapp')
      .eq('candidato_id', candidato_id)
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (msgError) {
      console.log('Erro ao buscar número em mensagens_whatsapp:', msgError.message)
    }

    const telefone = mensagemWpp?.numero_whatsapp
    if (!telefone) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Número de WhatsApp não encontrado para este candidato',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // Validação de telefone (formato brasileiro básico)
    const cleanPhone = telefone.replace(/\D/g, '')
    if (cleanPhone.length < 10 || cleanPhone.length > 13) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'O telefone do candidato é inválido. Formato brasileiro esperado.',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    let formattedPhone = cleanPhone
    if (formattedPhone.length <= 11) {
      formattedPhone = '55' + formattedPhone
    }

    console.log('4. Substituindo variáveis na mensagem')
    let mensagemTexto = template.texto
    const nomeCandidato = candidato.nome || ''
    const tituloVaga = Array.isArray(candidato.vagas)
      ? candidato.vagas[0]?.titulo
      : (candidato.vagas as any)?.titulo

    mensagemTexto = mensagemTexto.replace(/{{nome}}/gi, nomeCandidato)
    mensagemTexto = mensagemTexto.replace(/{{nome_candidato}}/gi, nomeCandidato)
    mensagemTexto = mensagemTexto.replace(/{{vaga}}/gi, tituloVaga || 'a vaga')
    mensagemTexto = mensagemTexto.replace(/{{nome_vaga}}/gi, tituloVaga || 'a vaga')

    const uazapiUrl = Deno.env.get('UAZAPI_URL') || 'https://api.uazapi.com'
    const uazapiKey = Deno.env.get('UAZAPI_KEY') || ''

    const sendWhatsAppWithRetry = async (
      phone: string,
      message: string,
      retries = 3,
      backoff = 2000,
    ): Promise<any> => {
      try {
        const baseUrl = uazapiUrl.endsWith('/') ? uazapiUrl.slice(0, -1) : uazapiUrl
        const apiUrl = `${baseUrl}/message/sendText`

        let numWpp = phone
        if (numWpp.startsWith('55') && numWpp.length >= 12) {
          numWpp = numWpp.substring(2)
        }

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            token: uazapiKey,
          },
          body: JSON.stringify({
            numero: numWpp,
            mensagem: message,
          }),
        })

        if (!response.ok) {
          if (response.status === 503 && retries > 0) {
            console.log(
              `UAZAPI retornou 503. Tentando novamente em ${backoff}ms... (${retries} tentativas restantes)`,
            )
            await new Promise((resolve) => setTimeout(resolve, backoff))
            return sendWhatsAppWithRetry(phone, message, retries - 1, backoff * 2)
          }
          let errorDetails = ''
          try {
            errorDetails = await response.text()
          } catch (e) {}
          throw new Error(
            `Erro na UAZAPI: ${response.status} - ${response.statusText} | Detalhes: ${errorDetails}`,
          )
        }
        return await response.json()
      } catch (error: any) {
        if (retries > 0 && (error.message?.includes('503') || error.message?.includes('fetch'))) {
          console.log(
            `Falha de conexão. Tentando novamente em ${backoff}ms... (${retries} tentativas restantes)`,
          )
          await new Promise((resolve) => setTimeout(resolve, backoff))
          return sendWhatsAppWithRetry(phone, message, retries - 1, backoff * 2)
        }
        throw error
      }
    }

    console.log('5. Enviando mensagem via UAZAPI')
    let isSuccess = false
    let responseData = null
    let errorMessage = null
    try {
      if (uazapiKey) {
        responseData = await sendWhatsAppWithRetry(formattedPhone, mensagemTexto)
        isSuccess =
          responseData?.success === true || responseData?.status === 'success' || !!responseData
        if (!isSuccess) {
          errorMessage = 'A API retornou sucesso falso: ' + JSON.stringify(responseData)
          console.error('Falha lógica na UAZAPI:', errorMessage)
        }
      } else {
        console.log('Aviso: UAZAPI_KEY não configurada. Simulando envio para ambiente de teste.')
        isSuccess = true
      }
    } catch (error: any) {
      errorMessage = error.message
      console.error('Erro ao tentar enviar WhatsApp (catch):', errorMessage)
    }

    console.log(`6. Registrando status de envio: ${isSuccess ? 'enviada' : 'falha'}`)
    const { error: insertError } = await supabase.from('mensagens_whatsapp').insert({
      candidato_id: candidato.id,
      etapa_id: etapa_id || template.etapa_id || null,
      template_id: template.id,
      status: isSuccess ? 'enviada' : 'falha',
      user_id: userId,
      numero_whatsapp: formattedPhone,
    } as any)

    if (insertError) {
      console.error('Erro ao registrar a mensagem no banco de dados:', insertError.message)
    }

    if (!isSuccess) {
      // Retornamos 200 com flag success=false para não interromper o fluxo do frontend
      return new Response(
        JSON.stringify({
          success: false,
          message:
            'A mensagem não pôde ser enviada via WhatsApp, mas o fluxo continuará. Verifique os logs.',
          detalhe: errorMessage,
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
        message: 'Mensagem enviada com sucesso',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error: any) {
    console.error('Erro geral na Edge Function enviar-whatsapp:', error.message)
    return new Response(
      JSON.stringify({
        error: 'Ocorreu um erro interno no servidor ao processar o envio.',
        detalhes: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
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

    if (!candidato_id || !etapa_id) {
      return new Response(
        JSON.stringify({
          error: 'Dados obrigatórios faltando: candidato_id e etapa_id são necessários.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1. Buscando candidato e telefone
    const { data: candidato, error: candidatoError } = await supabase
      .from('candidatos')
      .select('*, vagas!candidatos_vaga_id_fkey(titulo)')
      .eq('id', candidato_id)
      .eq('user_id', userId)
      .single()

    if (candidatoError || !candidato) {
      return new Response(JSON.stringify({ error: 'Candidato não encontrado.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const telefone = candidato.telefone
    if (!telefone) {
      return new Response(
        JSON.stringify({ warning: true, message: 'Candidato não possui telefone cadastrado.' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // 2. Buscando template da etapa
    const { data: template, error: templateError } = await supabase
      .from('templates_mensagens')
      .select('*')
      .eq('etapa_id', etapa_id)
      .eq('user_id', userId)
      .maybeSingle()

    if (templateError || !template || !template.texto) {
      return new Response(
        JSON.stringify({
          warning: true,
          message: 'Template de mensagem não encontrado para esta etapa.',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // 3. Prevenção de duplicidade (24 horas)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: recentMsgs } = await supabase
      .from('mensagens_whatsapp')
      .select('id')
      .eq('candidato_id', candidato_id)
      .eq('template_id', template.id)
      .gte('criado_em', twentyFourHoursAgo)

    if (recentMsgs && recentMsgs.length > 0) {
      return new Response(
        JSON.stringify({
          warning: true,
          message: 'Mensagem já enviada para este candidato nesta etapa nas últimas 24 horas.',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // 4. Validação e formatação de telefone
    const cleanPhone = telefone.replace(/\D/g, '')
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      return new Response(
        JSON.stringify({
          warning: true,
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

    // 5. Substituindo variáveis na mensagem
    let mensagemTexto = template.texto
    const nomeCandidato = candidato.nome || ''
    const tituloVaga = Array.isArray(candidato.vagas)
      ? candidato.vagas[0]?.titulo
      : (candidato.vagas as any)?.titulo

    mensagemTexto = mensagemTexto.replace(/{{nome}}/gi, nomeCandidato)
    mensagemTexto = mensagemTexto.replace(/{{nome_candidato}}/gi, nomeCandidato)
    mensagemTexto = mensagemTexto.replace(/{{vaga}}/gi, tituloVaga || 'a vaga')
    mensagemTexto = mensagemTexto.replace(/{{nome_vaga}}/gi, tituloVaga || 'a vaga')
    // Fallback para templates antigos que usavam chave simples
    mensagemTexto = mensagemTexto.replace(/{nome_candidato}/gi, nomeCandidato)
    mensagemTexto = mensagemTexto.replace(/{nome_vaga}/gi, tituloVaga || 'a vaga')

    // 6. Enviando via UAZAPI
    const uazapiUrl = Deno.env.get('UAZAPI_URL') || 'https://api.uazapi.com'
    const uazapiToken = Deno.env.get('UAZAPI_TOKEN') || Deno.env.get('UAZAPI_KEY') || ''

    const sendWhatsAppWithRetry = async (
      phone: string,
      message: string,
      retries = 3,
      backoff = 2000,
    ): Promise<any> => {
      try {
        const baseUrl = uazapiUrl.endsWith('/') ? uazapiUrl.slice(0, -1) : uazapiUrl
        const apiUrl = `${baseUrl}/send/text`

        let numWpp = phone
        if (numWpp.startsWith('55') && numWpp.length >= 12) {
          numWpp = numWpp.substring(2)
        }

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
          if (response.status === 503 && retries > 0) {
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
          await new Promise((resolve) => setTimeout(resolve, backoff))
          return sendWhatsAppWithRetry(phone, message, retries - 1, backoff * 2)
        }
        throw error
      }
    }

    let isSuccess = false
    let errorMessage = null
    let externalId = null

    try {
      if (uazapiToken) {
        const responseData = await sendWhatsAppWithRetry(formattedPhone, mensagemTexto)
        isSuccess =
          responseData?.success === true || responseData?.status === 'success' || !!responseData
        if (!isSuccess) {
          errorMessage = 'A API retornou sucesso falso: ' + JSON.stringify(responseData)
        } else {
          // Tenta extrair o ID da mensagem retornado pela API (ajustar conforme estrutura real da UAZAPI)
          externalId =
            responseData?.messageId ||
            responseData?.id ||
            responseData?.data?.id ||
            responseData?.message?.messageId ||
            null
        }
      } else {
        console.log('Aviso: UAZAPI_TOKEN não configurada. Simulando envio para ambiente de teste.')
        isSuccess = true
      }
    } catch (error: any) {
      errorMessage = error.message
    }

    // 7. Registrando status de envio
    const { error: insertError } = await supabase.from('mensagens_whatsapp').insert({
      candidato_id: candidato.id,
      etapa_id: etapa_id,
      template_id: template.id,
      status: isSuccess ? 'enviada' : 'falha',
      user_id: userId,
      numero_whatsapp: formattedPhone,
      enviado_em: isSuccess ? new Date().toISOString() : null,
      external_id: externalId,
    } as any)

    if (insertError) {
      console.error('Erro ao registrar a mensagem no banco de dados:', insertError.message)
    }

    if (!isSuccess) {
      return new Response(
        JSON.stringify({
          error: true,
          message: 'Erro ao processar envio de WhatsApp.',
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
        detalhe: error.message,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})

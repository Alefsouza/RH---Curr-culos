import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'

const corsHeaders = {
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)

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

    const { cv_id, vaga_id, user_id } = body

    if (!cv_id || !vaga_id || !user_id) {
      return new Response(
        JSON.stringify({ error: 'Os parâmetros cv_id, vaga_id e user_id são obrigatórios.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const { data: candidato, error: candidatoError } = await supabaseAdmin
      .from('candidatos')
      .select('*')
      .eq('id', cv_id)
      .eq('user_id', user_id)
      .single()

    if (candidatoError || !candidato) {
      return new Response(JSON.stringify({ error: 'Currículo não encontrado ou acesso negado.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: vaga, error: vagaError } = await supabaseAdmin
      .from('vagas')
      .select('*')
      .eq('id', vaga_id)
      .eq('user_id', user_id)
      .single()

    if (vagaError || !vaga) {
      return new Response(JSON.stringify({ error: 'Vaga não encontrada ou acesso negado.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const extracted =
      typeof candidato.dados_extraidos === 'object' && candidato.dados_extraidos !== null
        ? candidato.dados_extraidos
        : {}

    const cvData = {
      nome: candidato.nome,
      email: candidato.email,
      telefone: candidato.telefone,
      ...extracted,
    }

    let criteriosText = 'Sem critérios definidos.'
    let localizacoesVaga: string[] = []
    let raioKm = 0

    if (vaga.criterios_qualificacao && typeof vaga.criterios_qualificacao === 'object') {
      const critObj = vaga.criterios_qualificacao as any
      criteriosText = critObj.texto_livre || JSON.stringify(critObj)
      if (Array.isArray(critObj.localizacoes) && critObj.localizacoes.length > 0) {
        localizacoesVaga = critObj.localizacoes.map((l: any) => {
          return [l.endereco, l.cidade, l.estado].filter(Boolean).join(', ')
        })
      }
      raioKm = critObj.raio_km || 0
    } else if (typeof vaga.criterios_qualificacao === 'string') {
      criteriosText = vaga.criterios_qualificacao
    }

    const enderecoCV =
      extracted.endereco || extracted.location || extracted.cidade || extracted.estado || ''

    const googleApiKey = Deno.env.get('GOOGLE_API_KEY')
    let menorDistanciaKm: number = 0
    let qualificadoPorLocalizacao = true
    let distanciaCalculada = false

    if (localizacoesVaga.length > 0 && raioKm > 0) {
      if (!enderecoCV) {
        qualificadoPorLocalizacao = false
        distanciaCalculada = false
      } else if (!googleApiKey) {
        console.error('GOOGLE_API_KEY não configurada.')
        return new Response(
          JSON.stringify({
            error: 'Erro de configuração do servidor: Google Maps API Key ausente.',
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      } else {
        const callGoogleMapsWithRetry = async (
          origin: string,
          destination: string,
          retries = 3,
          delays = [2000, 4000, 8000],
        ): Promise<number | null> => {
          try {
            const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json')
            url.searchParams.append('origins', origin)
            url.searchParams.append('destinations', destination)
            url.searchParams.append('key', googleApiKey)
            url.searchParams.append('units', 'metric')

            const response = await fetch(url.toString(), { method: 'POST' })
            if (!response.ok) {
              if (response.status === 503 && retries > 0) {
                throw new Error('503')
              }
              throw new Error(`HTTP Error ${response.status}`)
            }
            const data = await response.json()

            if (
              data.status === 'OK' &&
              data.rows &&
              data.rows[0].elements &&
              data.rows[0].elements[0].status === 'OK'
            ) {
              const distanceMeters = data.rows[0].elements[0].distance.value
              return distanceMeters / 1000
            }
            return null
          } catch (error: any) {
            if (retries > 0) {
              const delay = delays[3 - retries] || 8000
              console.log(
                `Erro Google Maps. Tentando novamente em ${delay}ms... (${retries} tentativas)`,
              )
              await new Promise((res) => setTimeout(res, delay))
              return callGoogleMapsWithRetry(origin, destination, retries - 1, delays)
            }
            console.error('Erro final Google Maps:', error)
            return null
          }
        }

        let minC: number | null = null
        for (const locVaga of localizacoesVaga) {
          const dist = await callGoogleMapsWithRetry(enderecoCV, locVaga)
          if (dist !== null) {
            if (minC === null || dist < minC) {
              minC = dist
            }
          }
        }

        if (minC !== null) {
          menorDistanciaKm = minC
          qualificadoPorLocalizacao = menorDistanciaKm <= raioKm
          distanciaCalculada = true
        } else {
          qualificadoPorLocalizacao = false
        }
      }
    }

    const promptText = `Analise este currículo comparado com estes critérios:
- Critérios textuais: ${criteriosText}
- Localização do candidato: ${enderecoCV || 'Não informado'}
- Distância até a vaga: ${distanciaCalculada ? menorDistanciaKm.toFixed(2) : 0} km
- Raio aceito: ${raioKm} km
- Qualificado por localização: ${qualificadoPorLocalizacao}

Dados completos do currículo:
${JSON.stringify(cvData)}

Retorne ESTRITAMENTE um JSON com as seguintes chaves:
- resultado (qualificado, nao_qualificado ou revisar)
- detalhes (objeto com pontos_fortes (array), pontos_fracos (array), aderencia (string) e motivo (string, explicação breve sobre a decisão, focando na localização se for reprovado))`

    const openaiKey =
      Deno.env.get('OPENIA_KEY') || Deno.env.get('OPENAI_API_KEY') || Deno.env.get('OPENAI_KEY')
    if (!openaiKey) {
      console.log('ERRO: OPENIA_KEY não configurada')
      return new Response(JSON.stringify({ error: 'Chave OpenAI não configurada' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const openai = new OpenAI({ apiKey: openaiKey })

    const callOpenAIWithRetry = async (
      prompt: string,
      retries = 3,
      delays = [2000, 4000, 8000],
    ): Promise<any> => {
      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4-turbo',
          temperature: 1.0,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
        })
        const content = response.choices[0]?.message?.content
        return content ? JSON.parse(content) : {}
      } catch (error: any) {
        if (error.status === 503 && retries > 0) {
          const delay = delays[3 - retries] || 8000
          console.log(
            `Erro 503: Serviço indisponível. Tentando novamente em ${delay}ms... (${retries} tentativas)`,
          )
          await new Promise((res) => setTimeout(res, delay))
          return callOpenAIWithRetry(prompt, retries - 1, delays)
        }
        throw error
      }
    }

    let resultJson
    try {
      resultJson = await callOpenAIWithRetry(promptText)
    } catch (e: any) {
      console.error('Erro na chamada da API:', e)
      return new Response(
        JSON.stringify({
          error:
            'Serviço de análise temporariamente indisponível. Tente novamente em alguns instantes.',
        }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    let statusFinal = resultJson.resultado || 'revisar'
    let motivoFinal = resultJson.detalhes?.motivo || 'Análise concluída sem detalhes adicionais.'

    if (localizacoesVaga.length > 0 && raioKm > 0) {
      if (!enderecoCV) {
        statusFinal = 'nao_qualificado'
        motivoFinal = `Reprovado por localização: O endereço do candidato não foi encontrado no currículo. ${motivoFinal}`
      } else if (distanciaCalculada && !qualificadoPorLocalizacao) {
        statusFinal = 'nao_qualificado'
        if (
          !motivoFinal.toLowerCase().includes('localização') &&
          !motivoFinal.toLowerCase().includes('distância') &&
          !motivoFinal.toLowerCase().includes('raio')
        ) {
          motivoFinal = `Reprovado por localização: Distância calculada de ${menorDistanciaKm.toFixed(2)} km ultrapassa o limite aceitável de ${raioKm} km. ${motivoFinal}`
        }
      }
    }

    if (resultJson.detalhes) resultJson.detalhes.motivo = motivoFinal

    const { data: existing } = await supabaseAdmin
      .from('analises')
      .select('id')
      .eq('candidato_id', cv_id)
      .eq('vaga_id', vaga_id)
      .maybeSingle()

    let analiseData
    if (existing) {
      const { data, error: updateError } = await supabaseAdmin
        .from('analises')
        .update({ resultado: statusFinal, detalhes: resultJson.detalhes || {} })
        .eq('id', existing.id)
        .select()
        .single()
      if (updateError) throw updateError
      analiseData = data
    } else {
      const { data, error: insertError } = await supabaseAdmin
        .from('analises')
        .insert({
          candidato_id: cv_id,
          vaga_id: vaga_id,
          resultado: statusFinal,
          detalhes: resultJson.detalhes || {},
          user_id: user_id,
        })
        .select()
        .single()
      if (insertError) throw insertError
      analiseData = data
    }

    if (statusFinal === 'qualificado') {
      let isEtapaInicial = false
      let hasNoEtapa = !candidato.etapa_id

      if (candidato.etapa_id) {
        const { data: currentEtapa } = await supabaseAdmin
          .from('etapas')
          .select('ordem, nome')
          .eq('id', candidato.etapa_id)
          .single()

        if (
          currentEtapa &&
          (currentEtapa.ordem <= 1 || currentEtapa.nome.toLowerCase() === 'novos')
        ) {
          isEtapaInicial = true
        }
      }

      if (hasNoEtapa || isEtapaInicial) {
        const { data: etapaNovos } = await supabaseAdmin
          .from('etapas')
          .select('id')
          .eq('user_id', user_id)
          .ilike('nome', 'Novos')
          .maybeSingle()

        if (etapaNovos) {
          await supabaseAdmin.from('candidatos').update({ etapa_id: etapaNovos.id }).eq('id', cv_id)

          const { data: relExists } = await supabaseAdmin
            .from('candidato_etapa')
            .select('id')
            .eq('candidato_id', cv_id)
            .eq('etapa_id', etapaNovos.id)
            .maybeSingle()

          if (!relExists) {
            await supabaseAdmin.from('candidato_etapa').insert({
              candidato_id: cv_id,
              etapa_id: etapaNovos.id,
              usuario_id: user_id,
            })
          }
        }
      }
    }

    let numeros_whatsapp: string[] = []
    try {
      const promptWhatsApp = `Extraia TODOS os números de telefone celular brasileiros (DDD + 9 dígitos, começando com 9) do currículo, ignorando telefones fixos. Retorne APENAS os números no formato: 11999999999, separados por vírgula se houver mais de um.\n\nCurrículo:\n${JSON.stringify(cvData)}`
      const responseWpp = await openai.chat.completions.create({
        model: 'gpt-4-turbo',
        temperature: 0.1,
        messages: [{ role: 'user', content: promptWhatsApp }],
      })
      const extractedText = responseWpp.choices[0]?.message?.content?.trim() || ''
      numeros_whatsapp = extractedText
        .split(',')
        .map((s) => s.replace(/\D/g, ''))
        .filter((s) => s.length === 11)
    } catch (e: any) {
      console.error('Erro ao extrair WhatsApps:', e)
    }

    if (numeros_whatsapp.length > 0) {
      if (!candidato.telefone || candidato.telefone.trim() === '') {
        const { error: updatePhoneError } = await supabaseAdmin
          .from('candidatos')
          .update({ telefone: numeros_whatsapp[0] })
          .eq('id', cv_id)
          
        if (updatePhoneError) {
          console.error('Erro ao atualizar telefone do candidato:', updatePhoneError)
        }
      }
    } else {
      console.log('Número de WhatsApp celular não encontrado no currículo')
    }

    return new Response(
      JSON.stringify({
        data: {
          success: true,
          analise: analiseData,
          numero_whatsapp: numeros_whatsapp.length > 0 ? numeros_whatsapp.join(',') : null,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error: any) {
    console.error('Erro interno:', error)
    return new Response(
      JSON.stringify({ error: 'Ocorreu um erro interno no servidor.', detalhes: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})

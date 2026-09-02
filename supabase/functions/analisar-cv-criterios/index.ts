import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'
import { corsHeaders } from '../_shared/cors.ts'
import {
  normalizePhone,
  isValidBrazilianPhone,
  sanitizeAndValidateName,
  sanitizeAndValidateEmail,
} from '../_shared/validation.ts'

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
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { cv_id, vaga_id, user_id } = body

    if (!cv_id || !vaga_id) {
      return new Response(
        JSON.stringify({ error: 'Os parâmetros cv_id e vaga_id são obrigatórios.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { data: candidato, error: candidatoError } = await supabaseAdmin
      .from('candidatos')
      .select('*')
      .eq('id', cv_id)
      .single()

    if (candidatoError || !candidato) {
      return new Response(
        JSON.stringify({
          error: 'Currículo não encontrado. Verifique se o candidato existe.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const effectiveUserId = user_id || candidato.user_id

    const { data: vaga, error: vagaError } = await supabaseAdmin
      .from('vagas')
      .select('*')
      .eq('id', vaga_id)
      .single()

    if (vagaError || !vaga) {
      return new Response(
        JSON.stringify({
          error: 'Vaga não encontrada. Verifique se a vaga existe.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const extracted =
      typeof candidato.dados_extraidos === 'object' && candidato.dados_extraidos !== null
        ? candidato.dados_extraidos
        : {}

    // Sanitizar nome do candidato se estiver no formato genérico / placeholder
    let validName =
      sanitizeAndValidateName(candidato.nome) || sanitizeAndValidateName(extracted.nome)
    const validEmail =
      sanitizeAndValidateEmail(candidato.email) || sanitizeAndValidateEmail(extracted.email)

    // Se o nome não foi identificado mas temos email, formata o prefixo como fallback amigável
    if (!validName && validEmail) {
      const prefix = validEmail.split('@')[0]
      validName = prefix.replace(/[._-]/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
    }

    const cvData = {
      nome: validName || 'Candidato',
      email: validEmail,
      telefone: candidato.telefone,
      idade: extracted.idade ?? null,
      data_nascimento: extracted.data_nascimento ?? null,
      ...extracted,
    }

    // Identificar idade do candidato se disponível
    const idadeCandidato =
      extracted.idade !== undefined && extracted.idade !== null ? extracted.idade : null
    const dataNascimentoCandidato = extracted.data_nascimento || null

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
            status: 200,
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

    const promptText = `Analise este currículo comparado com os critérios da vaga "${vaga.titulo}":
- Descrição da vaga: ${vaga.descricao || 'Não informada'}
- Critérios textuais: ${criteriosText}
- Localização do candidato: ${enderecoCV || 'Não informado'}
- Idade do candidato: ${idadeCandidato !== null ? `${idadeCandidato} anos` : 'Não informada'}
- Data de nascimento: ${dataNascimentoCandidato || 'Não informada'}
- Distância até a vaga: ${distanciaCalculada ? menorDistanciaKm.toFixed(2) : 0} km
- Raio aceito: ${raioKm} km
- Qualificado por localização: ${qualificadoPorLocalizacao}

Dados completos do currículo:
${JSON.stringify(cvData)}

DIRETRIZES CRÍTICAS PARA AVALIAÇÃO DE CRITÉRIOS:
1. REGRA DE FAIXA ETÁRIA / IDADE (ATENÇÃO MÁXIMA):
   - A idade SÓ É CRITÉRIO quando os critérios da vaga MENCIONAREM EXPLICITAMENTE uma exigência de faixa etária ou idade (exemplos de vagas COM critério de idade: "18 a 22 anos", "entre 18 e 24 anos", "mínimo 18 anos", "até 30 anos", "jovem aprendiz 18 a 22 anos").
   - SE A VAGA NÃO MENCIONAR EXPLICITAMENTE NENHUMA EXIGÊNCIA DE IDADE / FAIXA ETÁRIA NOS CRITÉRIOS:
     * A idade ou data de nascimento do candidato DEVE SER COMPLETAMENTE IGNORADA na avaliação.
     * NUNCA reprove, desqualifique, penalize a pontuação nem envie para revisão um candidato por ausência de idade informada, falta de data de nascimento ou pela idade que possui quando a vaga não estipula idade.
     * NUNCA mencione falta de informação de idade como motivo de reprovação ou desqualificação quando a vaga não tiver critério de idade.
   - SOMENTE quando a vaga EXIGIR EXPLICITAMENTE uma faixa etária:
     * O critério passa a ser eliminatório.
     * Se a idade do candidato (ou calculada pela data de nascimento) for identificada e estiver COMPROVADAMENTE FORA da faixa exigida (ex: candidato com 31 anos para vaga que exige expressamente 18 a 22 anos): o candidato DEVE receber resultado = "nao_qualificado", score penalizado e o motivo DEVE explicitar a reprovação por idade ("Reprovado por faixa etária: Candidato possui X anos, fora da faixa exigida de Y a Z anos."). Inclua em 'unmatched_criteria'.
     * Se a vaga exigir faixa etária mas o currículo não contiver idade/data de nascimento, marque para 'revisar' com observação clara.

2. ESCOLARIDADE É REQUISITO MÍNIMO (ENSINO FUNDAMENTAL / MÉDIO / SUPERIOR):
   - Todo critério de escolaridade (ex: "Ensino Fundamental", "Ensino Fundamental incompleto", "Ensino Médio") expressa a ESCOLARIDADE MÍNIMA exigida. NUNCA penalize ou reprove um candidato por ter escolaridade superior à exigida.
   - Se o critério da vaga exigir "Ensino Fundamental" (incompleto ou completo), candidatos com Ensino Fundamental (completo/incompleto), Ensino Médio (completo/incompleto) ou Ensino Superior (completo/incompleto) ATENDEM PLENAMENTE ao requisito de escolaridade (NÃO reprovar por escolaridade).
   - Registre em 'matched_criteria' (ex: "Requerido Ensino Fundamental, candidato possui Ensino Médio/Superior") e NUNCA em 'unmatched_criteria'.
   - Se o critério exigir "Ensino Médio", candidatos com Ensino Médio ou Ensino Superior atendem ao requisito.

3. CURSOS DE TRANSPORTE COLETIVO E CREDENCIAIS:
   - Quando a vaga exigir ou mencionar "Curso" ou "Curso de transporte coletivo de passageiros" (ex: vagas de Motorista): considere VÁLIDO QUALQUER curso relativo a transporte coletivo (ex: "Curso de Transporte Coletivo", "Condutor de Veículo de Transporte Coletivo de Passageiros", "Resolução 168 / 789 do CONTRAN transporte coletivo", etc.).
   - CONSIDERE TAMBÉM quando o candidato colocar/informar "Credencial de Transporte Coletivo", "Credencial de Motorista de Coletivo" ou "Credencial" nas formações, cursos, certificações ou observações da CNH como atendimento pleno a essa exigência de curso/formação.

4. REGRA DE VAGAS DE MOTORISTA E STATUS "REVISAR" (IMPORTANTE):
   - Para vagas de MOTORISTA: caso falte comprovação clara ou haja dúvidas sobre tempo de experiência, categoria da CNH ou cursos/credenciais que justifiquem validação humana, o resultado DEVE ser "revisar".
   - Quando o resultado for "revisar", o candidato NÃO deve ser considerado desqualificado nem rebaixado para outra função — ele ficará pendente na vaga de Motorista para a Paola revisar manualmente.

5. AVALIAÇÃO GERAL E RESPEITO AOS CRITÉRIOS EXPLÍCITOS:
   - Continue considerando e respeitando todos os critérios explícitos de cada vaga (ex: exigência de CNH D ou E, tempo de experiência mandatório vs desejável, etc.).
   - As regras de flexibilização de escolaridade e credencial de transporte NÃO sobrepõem critérios explícitos da vaga (por exemplo: se a vaga exige CNH D/E, o candidato ainda precisa ter CNH D/E).
   - Não invente critérios eliminatórios que não constem na descrição ou critérios da vaga.

Retorne ESTRITAMENTE um JSON com as seguintes chaves:
- resultado (qualificado, nao_qualificado ou revisar)
- detalhes (objeto com score (número inteiro de 0 a 100 representando a compatibilidade geral do candidato), matched_criteria (array de objetos com nome (string) e evidencia (string)), unmatched_criteria (array de objetos com nome (string) e motivo (string)), summary (string com resumo conciso da análise), pontos_fortes (array de strings), pontos_fracos (array de strings), aderencia (string ex: '85%') e motivo (string, explicação breve sobre a decisão, focando no critério eliminatório como idade ou localização se for reprovado))`

    const openaiKey =
      Deno.env.get('OPENAI_KEY') || Deno.env.get('OPENAI_API_KEY') || Deno.env.get('OPENIA_KEY')
    if (!openaiKey) {
      console.log('ERRO: OPENAI_KEY não configurada')
      return new Response(JSON.stringify({ error: 'Chave OpenAI não configurada no servidor.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const openai = new OpenAI({ apiKey: openaiKey })

    const isRetryableError = (error: any) => {
      const status = error?.status || error?.statusCode || error?.response?.status
      if (status === 429) return true
      if (typeof status === 'number' && status >= 500 && status < 600) return true
      const msg = String(error?.message || '').toLowerCase()
      if (
        msg.includes('rate limit') ||
        msg.includes('429') ||
        msg.includes('timeout') ||
        msg.includes('fetch failed')
      ) {
        return true
      }
      return false
    }

    const callOpenAIWithRetry = async (
      prompt: string,
      retries = 3,
      delays = [2000, 4000, 8000],
    ): Promise<any> => {
      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'Você é um avaliador sênior de RH. Analise o perfil do candidato rigorosamente e retorne JSON válido em português brasileiro.',
            },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
        })
        const content = response.choices[0]?.message?.content
        return content ? JSON.parse(content) : {}
      } catch (error: any) {
        if (retries > 0 && isRetryableError(error)) {
          const delayIndex = 3 - retries
          const delay = delays[delayIndex] ?? 8000
          console.log(
            `Erro OpenAI (${error?.status || error?.message}). Tentando novamente em ${delay}ms... (${retries} tentativas restantes)`,
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
          status: 200,
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
          user_id: effectiveUserId || candidato.user_id,
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
          (currentEtapa.ordem <= 1 || currentEtapa.nome.toLowerCase() === 'triagem')
        ) {
          isEtapaInicial = true
        }
      }

      if (hasNoEtapa || isEtapaInicial) {
        const { data: etapaTriagem } = await supabaseAdmin
          .from('etapas')
          .select('id')
          .ilike('nome', 'Triagem')
          .maybeSingle()

        if (etapaTriagem) {
          await supabaseAdmin
            .from('candidatos')
            .update({ etapa_id: etapaTriagem.id })
            .eq('id', cv_id)

          const { data: relExists } = await supabaseAdmin
            .from('candidato_etapa')
            .select('id')
            .eq('candidato_id', cv_id)
            .eq('etapa_id', etapaTriagem.id)
            .maybeSingle()

          if (!relExists) {
            await supabaseAdmin.from('candidato_etapa').insert({
              candidato_id: cv_id,
              etapa_id: etapaTriagem.id,
              usuario_id: effectiveUserId || candidato.user_id,
            })
          }
        }
      }
    }

    // Se o candidato atual tiver nome corrigido e válido, atualizar no banco
    if (validName && validName !== candidato.nome) {
      await supabaseAdmin.from('candidatos').update({ nome: validName }).eq('id', cv_id)
    }

    return new Response(
      JSON.stringify({
        data: {
          success: true,
          analise: analiseData,
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
      JSON.stringify({
        error: 'Ocorreu um erro interno no servidor.',
        detalhes: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'
import { Buffer } from 'node:buffer'
import pdf from 'npm:pdf-parse@1.1.1'

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
    const url = new URL(req.url)
    const bodyText = await req.text()
    let body: any = {}
    if (bodyText) {
      try {
        body = JSON.parse(bodyText)
      } catch (e) {
        console.error('Erro ao fazer parse do JSON do webhook:', e)
      }
    }

    const userId = url.searchParams.get('user_id') || body.user_id
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Faltando user_id na requisição.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let attachmentBase64 = ''
    let attachmentName = ''

    const attachments = body.attachments || (body.value && body.value[0]?.attachments) || []
    for (const att of attachments) {
      if (att.name?.toLowerCase().endsWith('.pdf') || att.contentType === 'application/pdf') {
        attachmentBase64 = att.contentBytes || att.content || ''
        attachmentName = att.name
        break
      }
    }

    if (!attachmentBase64) {
      return new Response(JSON.stringify({ error: 'Nenhum arquivo PDF encontrado no e-mail.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2 & 3. Parse PDF
    const pdfBuffer = Buffer.from(attachmentBase64, 'base64')
    let pdfText = ''
    try {
      const data = await pdf(pdfBuffer)
      pdfText = data.text
    } catch (err) {
      console.error('Erro ao ler PDF:', err)
      return new Response(JSON.stringify({ error: 'Erro ao extrair texto do PDF.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!pdfText.trim()) {
      return new Response(
        JSON.stringify({ error: 'O arquivo PDF está vazio ou não contém texto legível.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // 4. OpenAI Extraction
    const openaiKey = Deno.env.get('OPENAI_KEY') || Deno.env.get('OPENIA_KEY')
    if (!openaiKey) {
      throw new Error('Chave da API da OpenAI não configurada no servidor.')
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
                'Você é um assistente de RH focado em estruturar dados de currículos. Retorne sempre um JSON válido.',
            },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
        })
        return JSON.parse(response.choices[0].message.content || '{}')
      } catch (error: any) {
        if (retries > 0 && isRetryableError(error)) {
          const delay = delays[3 - retries] ?? 8000
          console.log(
            `OpenAI erro (${error?.status || error?.message}), tentando novamente em ${delay}ms...`,
          )
          await new Promise((resolve) => setTimeout(resolve, delay))
          return callOpenAIWithRetry(prompt, retries - 1, delays)
        }
        throw error
      }
    }

    const extractionPrompt = `Extraia os seguintes dados do currículo: nome, email, telefones celulares, experiencia profissional, skills, formacao academica, endereço (cidade e estado ou completo), idade, data de nascimento, objetivo / cargo pretendido.
Extraia APENAS números de telefone celular brasileiros (DDD + 9 dígitos, começando com 9). Ignore telefones fixos. Formato: 11999999999.
Se algum dado não for encontrado, retorne null ou um array vazio.
Retorne ESTRITAMENTE em formato JSON com as seguintes chaves:
{
  "nome": "string ou null",
  "email": "string ou null",
  "telefones_celulares": ["string"],
  "endereco": "string ou null",
  "idade": "number ou null",
  "data_nascimento": "string ou null",
  "objetivo": "string ou null",
  "experiencia_profissional": ["string"],
  "skills": ["string"],
  "formacao_academica": ["string"]
}

Texto extraído do currículo:
${pdfText.substring(0, 15000)}
`

    let extractedData
    try {
      extractedData = await callOpenAIWithRetry(extractionPrompt)
      if (
        extractedData &&
        extractedData.data_nascimento &&
        typeof extractedData.data_nascimento === 'string'
      ) {
        const dStr = extractedData.data_nascimento.trim()
        let birthDate: Date | null = null
        const brMatch = dStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
        if (brMatch) {
          birthDate = new Date(
            parseInt(brMatch[3], 10),
            parseInt(brMatch[2], 10) - 1,
            parseInt(brMatch[1], 10),
          )
        } else {
          const isoMatch = dStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
          if (isoMatch) {
            birthDate = new Date(
              parseInt(isoMatch[1], 10),
              parseInt(isoMatch[2], 10) - 1,
              parseInt(isoMatch[3], 10),
            )
          } else {
            const parsed = new Date(dStr)
            if (!isNaN(parsed.getTime())) birthDate = parsed
          }
        }
        if (birthDate && !isNaN(birthDate.getTime())) {
          const now = new Date()
          let age = now.getFullYear() - birthDate.getFullYear()
          const m = now.getMonth() - birthDate.getMonth()
          if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) {
            age--
          }
          if (age >= 0 && age < 130) {
            extractedData.idade = age
          }
        }
      }
    } catch (err) {
      console.error('Erro na chamada da OpenAI:', err)
      return new Response(
        JSON.stringify({
          error: 'Erro ao analisar os dados do currículo com Inteligência Artificial.',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // Validação
    if (!extractedData.nome) {
      return new Response(
        JSON.stringify({ error: 'Nome não encontrado no currículo (dado obrigatório).' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    if (extractedData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(extractedData.email)) {
      return new Response(JSON.stringify({ error: 'O e-mail extraído do currículo é inválido.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    let telefonesArr: string[] = []
    if (Array.isArray(extractedData.telefones_celulares)) {
      telefonesArr = extractedData.telefones_celulares
    } else if (extractedData.telefone) {
      telefonesArr = [extractedData.telefone]
    }
    const extractedTelefone = telefonesArr.length > 0 ? telefonesArr.join(',') : null

    // 5 & 6. Deduplicação
    const cleanEmail = extractedData.email ? extractedData.email.replace(/"/g, '') : null
    const cleanNome = extractedData.nome ? extractedData.nome.replace(/"/g, '') : null

    const orConditions = []
    if (cleanEmail) orConditions.push(`email.eq."${cleanEmail}"`)
    if (cleanNome) orConditions.push(`nome.eq."${cleanNome}"`)
    if (extractedTelefone) {
      const tels = extractedTelefone
        .split(',')
        .map((t: string) => t.trim())
        .filter(Boolean)
      for (const tel of tels) {
        const safeTel = tel.replace(/"/g, '')
        orConditions.push(`telefone.ilike."%${safeTel}%"`)
      }
    }

    let candidatoId

    if (orConditions.length > 0) {
      const { data: duplicates, error: searchError } = await supabase
        .from('candidatos')
        .select('id')
        .eq('user_id', userId)
        .or(orConditions.join(','))

      if (searchError) console.error('Erro ao buscar duplicados:', searchError)

      if (duplicates && duplicates.length > 0) {
        candidatoId = duplicates[0].id

        await supabase
          .from('candidatos')
          .update({
            nome: extractedData.nome,
            email: extractedData.email || null,
            telefone: extractedTelefone,
            dados_extraidos: extractedData,
          })
          .eq('id', candidatoId)
      }
    }

    if (!candidatoId) {
      // 7. Inserir Candidato
      const { data: newCandidate, error: insertCandidateError } = await supabase
        .from('candidatos')
        .insert({
          nome: extractedData.nome,
          email: extractedData.email || null,
          telefone: extractedTelefone,
          dados_extraidos: extractedData,
          fonte: 'outlook',
          user_id: userId,
        })
        .select('id')
        .single()

      if (insertCandidateError) throw insertCandidateError
      candidatoId = newCandidate.id
    }

    // 8. Verificar Etapa Atual
    const { data: currentCandidate } = await supabase
      .from('candidatos')
      .select('etapa_id')
      .eq('id', candidatoId)
      .single()

    if (!currentCandidate?.etapa_id) {
      let { data: etapa } = await supabase
        .from('etapas')
        .select('id')
        .eq('user_id', userId)
        .ilike('nome', 'Triagem')
        .maybeSingle()

      if (!etapa) {
        const { data: newEtapa } = await supabase
          .from('etapas')
          .insert({
            nome: 'Triagem',
            ordem: 0,
            cor: '#6b7280',
            user_id: userId,
          })
          .select('id')
          .single()
        etapa = newEtapa
      }

      if (etapa) {
        await supabase.from('candidato_etapa').insert({
          candidato_id: candidatoId,
          etapa_id: etapa.id,
          usuario_id: userId,
        })
        await supabase.from('candidatos').update({ etapa_id: etapa.id }).eq('id', candidatoId)
      }
    }

    // 9 & 10. Analisar contra vagas abertas e ATIVAS
    const { data: vagas } = await supabase
      .from('vagas')
      .select('*')
      .eq('user_id', userId)
      .eq('ativa', true)
    const analisesRealizadas = []

    if (vagas && vagas.length > 0) {
      const googleApiKey = Deno.env.get('GOOGLE_API_KEY')

      for (const vaga of vagas) {
        let criteriosText = 'Sem critérios definidos.'
        let localizacoesVaga: string[] = []
        let raioKm = 0

        if (vaga.criterios_qualificacao && typeof vaga.criterios_qualificacao === 'object') {
          const critObj = vaga.criterios_qualificacao as any
          criteriosText = critObj.texto_livre || JSON.stringify(critObj)
          if (Array.isArray(critObj.localizacoes) && critObj.localizacoes.length > 0) {
            localizacoesVaga = critObj.localizacoes.map((l: any) =>
              [l.endereco, l.cidade, l.estado].filter(Boolean).join(', '),
            )
          }
          raioKm = critObj.raio_km || 0
        } else if (typeof vaga.criterios_qualificacao === 'string') {
          criteriosText = vaga.criterios_qualificacao
        }

        const enderecoCV = extractedData.endereco || ''
        let menorDistanciaKm: number | null = null
        let qualificadoPorLocalizacao = true
        let distanciaCalculada = false

        if (localizacoesVaga.length > 0 && raioKm > 0) {
          if (!enderecoCV) {
            qualificadoPorLocalizacao = false
            distanciaCalculada = false
          } else if (googleApiKey) {
            const callGoogleMaps = async (
              orig: string,
              dest: string,
              retries = 3,
            ): Promise<number | null> => {
              try {
                const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json')
                url.searchParams.append('origins', orig)
                url.searchParams.append('destinations', dest)
                url.searchParams.append('key', googleApiKey)
                url.searchParams.append('units', 'metric')
                const res = await fetch(url.toString(), { method: 'POST' })
                if (!res.ok) {
                  if (res.status === 503 && retries > 0) {
                    await new Promise((r) => setTimeout(r, 2000))
                    return callGoogleMaps(orig, dest, retries - 1)
                  }
                  return null
                }
                const data = await res.json()
                if (data.status === 'OK' && data.rows?.[0]?.elements?.[0]?.status === 'OK') {
                  return data.rows[0].elements[0].distance.value / 1000
                }
                return null
              } catch (e) {
                if (retries > 0) {
                  await new Promise((r) => setTimeout(r, 2000))
                  return callGoogleMaps(orig, dest, retries - 1)
                }
                return null
              }
            }

            for (const dest of localizacoesVaga) {
              const dist = await callGoogleMaps(enderecoCV, dest)
              if (dist !== null) {
                if (menorDistanciaKm === null || dist < menorDistanciaKm) menorDistanciaKm = dist
              }
            }

            if (menorDistanciaKm !== null) {
              qualificadoPorLocalizacao = menorDistanciaKm <= raioKm
              distanciaCalculada = true
            } else {
              qualificadoPorLocalizacao = false
            }
          }
        }

        const isCobrador = vaga.titulo?.toLowerCase().includes('cobrador') || false

        const analyzePrompt = `Analise o currículo para a vaga de "${vaga.titulo}".
Descrição da vaga: ${vaga.descricao || 'Não informada'}
Critérios Textuais: ${criteriosText}
Localização do Candidato: ${enderecoCV || 'Não informada'}
Distância calculada: ${distanciaCalculada ? menorDistanciaKm?.toFixed(2) + ' km' : 'N/A'} (Raio aceito: ${raioKm} km)
Qualificado por localização: ${qualificadoPorLocalizacao}

Dados estruturados do currículo:
${JSON.stringify(extractedData)}

DIRETRIZES DE AVALIAÇÃO:
0. REGRA MANDATÓRIA DE CRITÉRIOS ALTERNATIVOS COM "OU" (EX: "CATEGORIA D OU E"):
   Quando qualquer critério contiver alternativas com "OU" (ex: "Categoria D ou E", "CNH D ou E"):
   - QUALQUER UMA das alternativas satisfaz plenamente o critério!
   - Candidato com CNH Categoria D atende plenamente ao critério "Categoria D ou E" ✅.
   - Candidato com CNH Categoria E atende plenamente ao critério "Categoria D ou E" ✅.
   - NUNCA transforme "D ou E" em "somente E" ou "apenas E"!
   - NUNCA reprove nem afirme que a vaga exige somente E quando o critério disser "D ou E".

1. REGRA CONDICIONAL AO GÊNERO / SEXO (EX: "MULHERES APENAS SE TIVER CATEGORIA D NA CNH"):   Quando nos critérios da vaga houver regras condicionais do tipo "Mulheres apenas se tiver categoria D na CNH" ou "Mulheres apenas se...":
   - Identifique o gênero/sexo do candidato com base no primeiro nome ou dados do currículo.
   - SE O CANDIDATO FOR MULHER:
     * Para essa vaga só se admite mulher se ela tiver CNH categoria D (ou superior, ex: D, E, AD, AE).
     * Se for mulher e tiver CNH D: pode ser aprovada ✅ (critério atendido).
     * Se for mulher e NÃO tiver CNH D (ou não tiver comprovação): DEVE ser reprovada ❌ com resultado = "nao_qualificado" e motivo claro de reprovação por ausência de CNH D para candidata feminina.
   - SE O CANDIDATO FOR HOMEM:
     * Homem NÃO entra nessa regra! A regra condicional aplica-se SOMENTE a mulheres.
     * Para vaga de Cobrador: homem NÃO precisa de CNH, NÃO precisa informar CNH e NÃO deve ter categoria de CNH avaliada. A ausência de CNH ou de dados de CNH em homem NUNCA deve reprovar nem enviar para revisão ("revisar").
     * NUNCA reprove ou envie homem para revisão por falta de CNH sob esse critério condicional.
   - Demais critérios da vaga continuam valendo normalmente para todos (homens e mulheres).
2. IDADE / FAIXA ETÁRIA:
   - A idade só é critério quando a vaga mencionar expressamente uma faixa etária.
   - Se a vaga tiver faixa etária mas o currículo NÃO contiver idade/data de nascimento (idade null), a avaliação segue normalmente sem reprovar e sem marcar como "revisar" se os demais critérios (escolaridade e localização) forem atendidos. Se a idade for comprovadamente fora da faixa, reprova ("nao_qualificado").
3. ESCOLARIDADE (ENSINO FUNDAMENTAL / MÉDIO / SUPERIOR): Todo critério de escolaridade expressa a escolaridade mínima. Se a vaga exige Ensino Fundamental (incompleto ou completo), candidatos com Ensino Fundamental, Ensino Médio ou Ensino Superior atendem plenamente ao requisito e não podem ser reprovados por escolaridade.
4. CURSOS DE TRANSPORTE COLETIVO E CREDENCIAL: Quando a vaga exigir ou mencionar curso de transporte coletivo, considere válido qualquer curso relativo a transporte coletivo. Considere também quando o candidato colocar "Credencial de Transporte Coletivo" como curso/formação.
5. REGRA DE MOTORISTA E STATUS "REVISAR": Para vagas de MOTORISTA, caso falte comprovação clara ou haja dúvidas sobre categoria da CNH, experiência ou cursos que justifiquem validação humana, o resultado DEVE ser "revisar" (para a Paola revisar manualmente) e NÃO deve ser alterado para outra vaga nem aprovado como Cobrador.
6. CRITÉRIOS EXPLÍCITOS: Continue considerando os critérios explícitos de cada vaga (ex: CNH D/E para Motorista). As novas regras não sobrepõem critérios explícitos da vaga. Critérios alternativos com "ou" (como "Categoria D ou E") são atendidos por qualquer uma das opções. Não invente requisitos que não estejam expressos na vaga.
Retorne ESTRITAMENTE em formato JSON com as seguintes chaves:
{
  "resultado": "qualificado" | "nao_qualificado" | "revisar",
  "detalhes": {
    "pontos_fortes": ["string"],
    "pontos_fracos": ["string"],
    "aderencia": "percentual de aderência (ex: 80%)",
    "motivo": "string explicando a reprovação se aplicável, especialmente se for por localização"
  }
}`

        try {
          const analiseJson = await callOpenAIWithRetry(analyzePrompt)

          let statusFinal = analiseJson.resultado || 'revisar'
          let motivoFinal = analiseJson.detalhes?.motivo || ''

          if (localizacoesVaga.length > 0 && raioKm > 0) {
            if (!enderecoCV) {
              statusFinal = 'nao_qualificado'
              motivoFinal = `Reprovado por localização: Endereço não identificado no currículo. ${motivoFinal}`
            } else if (distanciaCalculada && !qualificadoPorLocalizacao) {
              statusFinal = 'nao_qualificado'
              if (
                !motivoFinal.toLowerCase().includes('localização') &&
                !motivoFinal.toLowerCase().includes('distância')
              ) {
                motivoFinal = `Reprovado por localização: Distância de ${menorDistanciaKm?.toFixed(2)} km excede o raio de ${raioKm} km. ${motivoFinal}`
              }
            }
          }

          // PÓS-VALIDAÇÃO DETERMINÍSTICA: CRITÉRIOS COM ALTERNATIVAS "OU" (EX: CNH D OU E)
          const critVagaLower = (criteriosText || '').toLowerCase()
          const vagaTemCnhDouE =
            critVagaLower.includes('categoria d ou e') ||
            critVagaLower.includes('cnh d ou e') ||
            critVagaLower.includes('categoria d/e') ||
            critVagaLower.includes('d ou e')

          const cvSkillsStr = Array.isArray(extractedData.skills)
            ? extractedData.skills.join(' ')
            : ''
          const cvCnhFull = (
            (extractedData.cnh || '') +
            ' ' +
            (extractedData.categoria_cnh || '') +
            ' ' +
            (extractedData.cnh_categoria || '') +
            ' ' +
            (extractedData.habilitacao || '') +
            ' ' +
            cvSkillsStr +
            ' ' +
            (extractedData.resumo_cv || '')
          ).toLowerCase()

          const cvHasD =
            /\b(cnh|categoria|cat|habilitacao)\s*(categoria\s*)?([a-c]*d[a-e]*)\b/.test(
              cvCnhFull,
            ) ||
            /\bcnh\s*d\b/.test(cvCnhFull) ||
            /\bcategoria\s*d\b/.test(cvCnhFull) ||
            cvCnhFull.includes('categoria d') ||
            cvCnhFull.includes('cnh d')

          const cvHasE =
            /\b(cnh|categoria|cat|habilitacao)\s*(categoria\s*)?([a-d]*e)\b/.test(cvCnhFull) ||
            /\bcnh\s*e\b/.test(cvCnhFull) ||
            /\bcategoria\s*e\b/.test(cvCnhFull) ||
            cvCnhFull.includes('categoria e') ||
            cvCnhFull.includes('cnh e')

          if (vagaTemCnhDouE && (cvHasD || cvHasE)) {
            const mLower = motivoFinal.toLowerCase()
            if (
              mLower.includes('deve ser e') ||
              mLower.includes('somente e') ||
              mLower.includes('apenas e') ||
              mLower.includes('requer categoria e') ||
              (mLower.includes('categoria da cnh') && mLower.includes('categoria e'))
            ) {
              motivoFinal = motivoFinal
                .replace(
                  /e por não atender o critério eliminatório de Categoria da CNH[^,.]*[,.]?/gi,
                  '',
                )
                .replace(
                  /por não atender o critério eliminatório de Categoria da CNH[^,.]*e /gi,
                  '',
                )
                .replace(/não atender o critério eliminatório de Categoria da CNH[^,.]*[,.]?/gi, '')
                .replace(/que deve ser E[,.]?/gi, '')
                .replace(/requer Categoria E[^,.]*[,.]?/gi, '')
                .trim()

              if (!qualificadoPorLocalizacao) {
                motivoFinal = `Reprovado por localização: Distância de ${menorDistanciaKm?.toFixed(2)} km excede o raio de ${raioKm} km. O candidato atende à CNH Categoria ${cvHasD ? 'D' : 'E'}.`
              } else if (motivoFinal.length < 10) {
                motivoFinal =
                  'Candidato atende aos critérios da vaga, incluindo Categoria da CNH (D ou E).'
              }
            }

            if (statusFinal === 'nao_qualificado' && qualificadoPorLocalizacao) {
              statusFinal = 'qualificado'
              motivoFinal = `Qualificado: Candidato atende aos critérios da vaga, incluindo CNH Categoria ${cvHasD ? 'D' : 'E'}.`
            }
          }

          // Salvaguarda: Cobrador + Homem
          if (isCobrador && statusFinal === 'revisar') {
            const isFemale =
              extractedData.genero === 'feminino' ||
              extractedData.sexo === 'feminino' ||
              /^(maria|ana|juliana|camila|patricia|aline|amanda|beatriz|bruna|carolina|daniela|debora|fernanda|gabriela|jessica|larissa|leticia|luana|mariana|natalia|paula|rafaela|renata|sabrina|tatiane|vanessa|flavia|elisabete|elizabeth|andreia|marcia|simone|luciana|rosana|valeria|claudia|cristina|adriana|priscila|monica)\b/i.test(
                extractedData.nome || '',
              )

            if (!isFemale) {
              const textCheck =
                `${motivoFinal} ${analiseJson.detalhes?.summary || ''}`.toLowerCase()
              const isTravaCnhOuIdade =
                textCheck.includes('cnh') ||
                textCheck.includes('idade') ||
                textCheck.includes('nascimento') ||
                textCheck.includes('habilita')

              const localizacaoOk =
                localizacoesVaga.length === 0 ||
                raioKm === 0 ||
                (qualificadoPorLocalizacao && enderecoCV)

              if (isTravaCnhOuIdade && localizacaoOk) {
                statusFinal = 'qualificado'
                motivoFinal =
                  'Qualificado para Cobrador: candidato atende aos critérios da vaga. (Para candidatos do sexo masculino não é exigida CNH, e a avaliação segue normalmente).'
              }
            }
          }

          if (analiseJson.detalhes) analiseJson.detalhes.motivo = motivoFinal

          const { data: novaAnalise, error: analiseError } = await supabase
            .from('analises')
            .insert({
              candidato_id: candidatoId,
              vaga_id: vaga.id,
              resultado: statusFinal,
              detalhes: analiseJson.detalhes || {},
              user_id: userId,
            })
            .select()
            .single()

          if (!analiseError) analisesRealizadas.push(novaAnalise)
          else console.error('Erro ao inserir análise no banco:', analiseError)
        } catch (e) {
          console.error(`Erro ao analisar a vaga ${vaga.titulo}:`, e)
        }
      }
    }

    // 11. Resposta de Sucesso
    return new Response(
      JSON.stringify({
        success: true,
        candidato_id: candidatoId,
        dados_extraidos: extractedData,
        analises: analisesRealizadas,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error: any) {
    console.error('Erro interno ao processar webhook:', error)
    return new Response(
      JSON.stringify({
        error: 'Ocorreu um erro interno no servidor ao processar o currículo.',
        detalhes: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})

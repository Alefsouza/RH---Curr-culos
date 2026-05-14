import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'
import { Buffer } from 'node:buffer'
import pdf from 'npm:pdf-parse@1.1.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('--- Iniciando processamento do currículo ---')
    const bodyText = await req.text()
    let body
    try {
      body = JSON.parse(bodyText)
      console.log('Payload recebido e processado com sucesso.')
    } catch (e) {
      console.error('Erro ao fazer parse do payload:', e)
      return new Response(JSON.stringify({ error: 'Payload inválido. Formato JSON esperado.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { filePath, nome, email, telefone, vaga_id, user_id } = body

    console.log('Validando dados de entrada...')
    if (!filePath) {
      console.error('Erro: filePath não fornecido na requisição.')
      return new Response(
        JSON.stringify({ error: 'O caminho do arquivo PDF (filePath) é obrigatório.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    if (!nome || !user_id) {
      console.error('Erro: nome ou user_id ausentes.')
      return new Response(
        JSON.stringify({
          error: 'Dados incompletos. Nome e identificador do usuário são obrigatórios.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    console.log(`Validando vaga_id recebido: ${vaga_id}`)
    if (!vaga_id) {
      console.error('Erro: vaga_id ausente ou vazio.')
      return new Response(JSON.stringify({ error: 'Vaga é obrigatória.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(vaga_id)) {
      console.error(`Erro: vaga_id inválido (${vaga_id}). Não é um UUID válido.`)
      return new Response(JSON.stringify({ error: 'Vaga inválida. Selecione uma vaga válida.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('Verificando chaves e credenciais nos Secrets...')
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    const openaiKey = Deno.env.get('OPENAI_KEY') || Deno.env.get('OPENIA_KEY')
    if (!openaiKey) {
      console.error('Erro fatal: Chave da API da OpenAI não configurada nos Secrets do Supabase.')
      return new Response(
        JSON.stringify({
          error: 'Configuração do servidor incompleta. A chave da OpenAI não foi encontrada.',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log(`Baixando arquivo PDF do Storage: ${filePath}`)
    // 1. Download PDF from Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('curriculos')
      .download(filePath)

    if (downloadError || !fileData) {
      console.error('Erro ao baixar arquivo do Storage:', downloadError)
      return new Response(
        JSON.stringify({
          error:
            'Erro ao acessar o arquivo enviado no banco de dados. Verifique se o arquivo existe e foi salvo corretamente.',
          detalhes: downloadError,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    console.log(`Arquivo PDF baixado com sucesso. Tamanho: ${fileData.size} bytes`)

    // 2. Parse PDF
    console.log('Iniciando extração de texto do arquivo PDF...')
    const arrayBuffer = await fileData.arrayBuffer()
    const pdfBuffer = Buffer.from(arrayBuffer)
    let pdfText = ''
    try {
      const data = await pdf(pdfBuffer)
      pdfText = data.text
      console.log(`Texto extraído com sucesso do PDF. Total de caracteres: ${pdfText.length}`)
    } catch (err: any) {
      console.error('Erro na extração de texto do PDF:', err)
      return new Response(
        JSON.stringify({
          error:
            'Erro ao extrair texto do PDF. O arquivo pode estar corrompido ou protegido por senha.',
          detalhes: err.message,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    if (!pdfText || !pdfText.trim()) {
      console.error('Aviso: O PDF extraído não contém texto (pode ser uma imagem).')
      return new Response(
        JSON.stringify({
          error:
            'O arquivo PDF está vazio ou não contém texto legível (pode ser uma imagem sem OCR).',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // 3. OpenAI Extraction
    const openai = new OpenAI({ apiKey: openaiKey })

    const callOpenAIWithRetry = async (
      prompt: string,
      retries = 3,
      backoff = 2000,
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
        console.error(`Falha na OpenAI (Tentativas restantes: ${retries}):`, error.message || error)
        if (retries > 0) {
          console.log(`Retentando chamada à OpenAI em ${backoff}ms...`)
          await new Promise((resolve) => setTimeout(resolve, backoff))
          return callOpenAIWithRetry(prompt, retries - 1, backoff * 2)
        }
        throw error
      }
    }

    const extractionPrompt = `Extraia os seguintes dados do currículo: nome, email, telefone, experiencia profissional, skills, formacao academica, endereço (cidade e estado ou completo).
Se algum dado não for encontrado, retorne null ou um array vazio.
Retorne ESTRITAMENTE em formato JSON com as seguintes chaves:
{
  "nome": "string ou null",
  "email": "string ou null",
  "telefone": "string ou null",
  "endereco": "string ou null",
  "experiencia_profissional": ["string"],
  "skills": ["string"],
  "formacao_academica": ["string"]
}

Texto extraído do currículo:
${pdfText.substring(0, 15000)}`

    let extractedData
    try {
      console.log('Enviando texto extraído para a Inteligência Artificial (OpenAI)...')
      extractedData = await callOpenAIWithRetry(extractionPrompt)
      console.log('Estruturação de dados pela OpenAI concluída com sucesso.')
    } catch (err: any) {
      console.error('Erro crítico e final na chamada da OpenAI:', err)
      return new Response(
        JSON.stringify({
          error:
            'Serviço de Inteligência Artificial indisponível no momento. Não foi possível analisar o currículo.',
          detalhes: err.message,
        }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const finalEmail = email || extractedData.email || null
    const finalTelefone = telefone || extractedData.telefone || null
    const finalNome = nome || extractedData.nome || 'Candidato Desconhecido'

    // 4. Deduplication and Database operations
    console.log('Iniciando comunicação com o banco de dados (Deduplicação e Inserção)...')

    try {
      const orConditions = []
      if (finalEmail) {
        const safeEmail = finalEmail.replace(/"/g, '')
        orConditions.push(`email.eq."${safeEmail}"`)
      }
      if (finalTelefone) {
        const safeTel = finalTelefone.replace(/"/g, '')
        orConditions.push(`telefone.eq."${safeTel}"`)
      }

      const { data: publicUrlData } = supabase.storage.from('curriculos').getPublicUrl(filePath)
      const finalVagaId = vaga_id
      
      let candidatoId;

      if (orConditions.length > 0) {
        console.log('Verificando candidatos duplicados no sistema...')
        const { data: duplicates, error: dupError } = await supabase
          .from('candidatos')
          .select('id, vaga_id, etapa_id')
          .eq('user_id', user_id)
          .or(orConditions.join(','))

        if (dupError) {
          console.error('Erro ao buscar candidatos duplicados:', dupError)
          throw dupError
        }

        if (duplicates && duplicates.length > 0) {
          candidatoId = duplicates[0].id;
          console.log(`Aviso: Foram encontrados candidatos duplicados. Atualizando registro ${candidatoId}...`)
          
          const { error: updateError } = await supabase.from('candidatos').update({
            nome: finalNome,
            email: finalEmail,
            telefone: finalTelefone,
            curriculo_url: publicUrlData.publicUrl,
            dados_extraidos: extractedData,
            vaga_id: finalVagaId || duplicates[0].vaga_id,
          }).eq('id', candidatoId)

          if (updateError) {
            console.error('Erro ao atualizar candidato duplicado:', updateError)
            throw updateError
          }
        } else {
          console.log('Nenhum candidato duplicado detectado.')
        }
      }

      if (!candidatoId) {
        // 5. Insert Candidate
        console.log('Preparando para inserir o novo candidato na base de dados...')
        
        console.log(`Inserindo candidato com vaga_id processado: ${finalVagaId}`)

        const { data: newCandidate, error: insertCandidateError } = await supabase
          .from('candidatos')
          .insert({
            nome: finalNome,
            email: finalEmail,
            telefone: finalTelefone,
            fonte: 'site',
            curriculo_url: publicUrlData.publicUrl,
            dados_extraidos: extractedData,
            vaga_id: finalVagaId,
            user_id: user_id,
          })
          .select('id')
          .single()

        if (insertCandidateError) {
          console.error('Erro ao inserir candidato na tabela:', insertCandidateError)
          throw insertCandidateError
        }
        candidatoId = newCandidate.id
        console.log(`Sucesso: Candidato registrado no banco de dados. ID Gerado: ${candidatoId}`)
      }

      // 6. Verificar Etapa Atual
      console.log('Verificando se o candidato já possui uma etapa...');
      const { data: currentCandidate } = await supabase
        .from('candidatos')
        .select('etapa_id')
        .eq('id', candidatoId)
        .single();

      if (!currentCandidate?.etapa_id) {
        console.log('Buscando etapa padrão "Novos"...')
        let { data: etapa, error: etapaError } = await supabase
          .from('etapas')
          .select('id')
          .eq('user_id', user_id)
          .ilike('nome', 'Novos')
          .maybeSingle()

        if (etapaError) {
          console.error('Erro ao consultar etapas do usuário:', etapaError)
          throw etapaError
        }

        if (!etapa) {
          console.log('A etapa "Novos" não foi encontrada. Criando nova etapa...')
          const { data: newEtapa, error: insertEtapaError } = await supabase
            .from('etapas')
            .insert({
              nome: 'Novos',
              ordem: 0,
              cor: 'bg-blue-100',
              user_id: user_id,
            })
            .select('id')
            .single()

          if (insertEtapaError) {
            console.error('Erro ao criar a nova etapa:', insertEtapaError)
            throw insertEtapaError
          }
          etapa = newEtapa
          console.log('Nova etapa "Novos" criada com sucesso.')
        }

        if (etapa) {
          console.log(`Relacionando o candidato à etapa de ID: ${etapa.id}`)
          const { error: relError } = await supabase.from('candidato_etapa').insert({
            candidato_id: candidatoId,
            etapa_id: etapa.id,
            usuario_id: user_id,
          })
          if (relError) throw relError

          const { error: updError } = await supabase
            .from('candidatos')
            .update({ etapa_id: etapa.id })
            .eq('id', candidatoId)
          if (updError) throw updError
          console.log('Candidato inserido na etapa corretamente.')
        }
      } else {
        console.log('Candidato já está em uma etapa. Mantendo a etapa atual.');
      }

      // 7. Analyze against job criteria
      const analisesRealizadas = []
      if (finalVagaId) {
        console.log(
          `Iniciando análise de aderência do candidato para a vaga vinculada (ID: ${finalVagaId})...`,
        )
        const { data: vaga, error: vagaError } = await supabase
          .from('vagas')
          .select('*')
          .eq('id', finalVagaId)
          .single()

        if (vagaError) {
          console.error('Erro ao buscar detalhes da vaga para análise:', vagaError)
          throw vagaError
        }

        if (vaga) {
          let criteriosText = "Sem critérios definidos.";
          let localizacoesVaga: string[] = [];
          let raioKm = 0;

          if (vaga.criterios_qualificacao && typeof vaga.criterios_qualificacao === 'object') {
            const critObj = vaga.criterios_qualificacao as any;
            criteriosText = critObj.texto_livre || JSON.stringify(critObj);
            if (Array.isArray(critObj.localizacoes) && critObj.localizacoes.length > 0) {
              localizacoesVaga = critObj.localizacoes.map((l: any) => [l.endereco, l.cidade, l.estado].filter(Boolean).join(', '));
            }
            raioKm = critObj.raio_km || 0;
          } else if (typeof vaga.criterios_qualificacao === 'string') {
            criteriosText = vaga.criterios_qualificacao;
          }

          const enderecoCV = extractedData.endereco || "";
          let menorDistanciaKm: number | null = null;
          let qualificadoPorLocalizacao = true;
          let distanciaCalculada = false;

          const googleApiKey = Deno.env.get('GOOGLE_API_KEY');

          if (localizacoesVaga.length > 0 && raioKm > 0) {
            if (!enderecoCV) {
              qualificadoPorLocalizacao = false;
              distanciaCalculada = false;
            } else if (googleApiKey) {
              const callGoogleMaps = async (orig: string, dest: string, retries = 3): Promise<number | null> => {
                try {
                  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
                  url.searchParams.append("origins", orig);
                  url.searchParams.append("destinations", dest);
                  url.searchParams.append("key", googleApiKey);
                  url.searchParams.append("units", "metric");
                  const res = await fetch(url.toString(), { method: 'POST' });
                  if (!res.ok) {
                    if (res.status === 503 && retries > 0) { await new Promise(r => setTimeout(r, 2000)); return callGoogleMaps(orig, dest, retries - 1); }
                    return null;
                  }
                  const data = await res.json();
                  if (data.status === "OK" && data.rows?.[0]?.elements?.[0]?.status === "OK") {
                    return data.rows[0].elements[0].distance.value / 1000;
                  }
                  return null;
                } catch (e) {
                  if (retries > 0) { await new Promise(r => setTimeout(r, 2000)); return callGoogleMaps(orig, dest, retries - 1); }
                  return null;
                }
              }

              for (const dest of localizacoesVaga) {
                const dist = await callGoogleMaps(enderecoCV, dest);
                if (dist !== null) {
                  if (menorDistanciaKm === null || dist < menorDistanciaKm) menorDistanciaKm = dist;
                }
              }

              if (menorDistanciaKm !== null) {
                qualificadoPorLocalizacao = menorDistanciaKm <= raioKm;
                distanciaCalculada = true;
              } else {
                qualificadoPorLocalizacao = false;
              }
            }
          }

          const analyzePrompt = `Analise o currículo para a vaga de "${vaga.titulo}".
Descrição da vaga: ${vaga.descricao || 'Não informada'}
Critérios Textuais: ${criteriosText}
Localização do Candidato: ${enderecoCV || "Não informada"}
Distância calculada: ${distanciaCalculada ? menorDistanciaKm?.toFixed(2) + ' km' : 'N/A'} (Raio aceito: ${raioKm} km)
Qualificado por localização: ${qualificadoPorLocalizacao}

Dados estruturados do currículo:
${JSON.stringify(extractedData)}

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
            console.log('Enviando dados da vaga para análise comportamental na OpenAI...')
            const analiseJson = await callOpenAIWithRetry(analyzePrompt)
            console.log('Feedback da análise da vaga recebido da OpenAI.')
            
            let statusFinal = analiseJson.resultado || 'revisar';
            let motivoFinal = analiseJson.detalhes?.motivo || '';

            if (localizacoesVaga.length > 0 && raioKm > 0) {
              if (!enderecoCV) {
                statusFinal = 'nao_qualificado';
                motivoFinal = `Reprovado por localização: Endereço não identificado no currículo. ${motivoFinal}`;
              } else if (distanciaCalculada && !qualificadoPorLocalizacao) {
                statusFinal = 'nao_qualificado';
                if (!motivoFinal.toLowerCase().includes('localização') && !motivoFinal.toLowerCase().includes('distância')) {
                  motivoFinal = `Reprovado por localização: Distância de ${menorDistanciaKm?.toFixed(2)} km excede o raio de ${raioKm} km. ${motivoFinal}`;
                }
              }
            }
            if (analiseJson.detalhes) analiseJson.detalhes.motivo = motivoFinal;

            console.log(`Salvando resultado da análise no banco para a vaga_id: ${vaga.id}`)
            const { data: novaAnalise, error: analiseError } = await supabase
              .from('analises')
              .insert({
                candidato_id: candidatoId,
                vaga_id: vaga.id,
                resultado: statusFinal,
                detalhes: analiseJson.detalhes || {},
                user_id: user_id,
              })
              .select()
              .single()

            if (!analiseError) {
              analisesRealizadas.push(novaAnalise)
              console.log('Relatório de análise de vaga salvo no banco de dados.')
            } else {
              console.error('Erro ao tentar salvar o relatório de análise:', analiseError)
              throw analiseError
            }
          } catch (e: any) {
            console.error(
              `Aviso: Falha ao gerar a análise para a vaga "${vaga.titulo}". O processo continuará.`,
              e,
            )
          }
        }
      }

      console.log(
        '--- Processamento do currículo e persistência de dados concluídos com SUCESSO ---',
      )

      // 8. Success Response
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
    } catch (dbError: any) {
      console.error('Erro Crítico no Banco de Dados:', dbError)
      return new Response(
        JSON.stringify({
          error: 'Ocorreu um erro interno ao salvar os dados no banco de dados.',
          detalhes: dbError.message || JSON.stringify(dbError),
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }
  } catch (error: any) {
    console.error('Erro Fatal Não Tratado:', error)
    return new Response(
      JSON.stringify({
        error: 'Ocorreu um erro interno inesperado no servidor ao processar o currículo.',
        detalhes: error.message || String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})

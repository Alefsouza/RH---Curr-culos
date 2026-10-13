import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import {
  REFERENCE_LOCATIONS,
  calculateHaversineDistance,
  extractCep,
  formatAddressString,
  getReferenceCoordsForText,
  Coordinates,
} from '../_shared/proximity.ts'

// Mapa estático de coordenadas para os CEPs conhecidos dos candidatos e referências
const KNOWN_CEP_COORDS: Record<string, Coordinates> = {
  // Garagens de referência:
  // Cursino (Av do Cursino, 5797): -23.649646, -46.619082
  // Leste / Sapopemba (Rua Leandro de Sevilha, 95): -23.59712, -46.508518

  // Valdecir Dias Batista (Rua Beltrão, 121, Pq Sta Madalena)
  '03982-020': { lat: -23.6097, lng: -46.5162 },
  '03982020': { lat: -23.6097, lng: -46.5162 },

  // Beatriz Lima De Oliveira (Rua Ilha da Trindade, 271, Pq Sta Madalena)
  '03981-020': { lat: -23.6085, lng: -46.515 },
  '03981020': { lat: -23.6085, lng: -46.515 },

  // Camila Adrieli da Silva Diogo (Rua Livino Dargolo, 43, Jd Sapopemba)
  '03929-210': { lat: -23.595, lng: -46.502 },
  '03929210': { lat: -23.595, lng: -46.502 },

  // Rodrigo Cesar Marucho (Rua Arnaldo Pedroso D Horta, 285, Vila Industrial)
  '03254-000': { lat: -23.596, lng: -46.525 },
  '03254000': { lat: -23.596, lng: -46.525 },

  // Everton Ramos da Silva (Rua Pico do Jabre, 189, Pq Sta Madalena)
  '03982-010': { lat: -23.6105, lng: -46.516 },
  '03982010': { lat: -23.6105, lng: -46.516 },

  // Caique da Silva Santos (Rua Projetada Dois, 44, São Mateus/Iguatemi)
  '08330-404': { lat: -23.598, lng: -46.465 },
  '08330404': { lat: -23.598, lng: -46.465 },

  // Alanna Barbara da Conceição (Rua Olavo Faggin, 125, São Mateus)
  '08331-110': { lat: -23.6, lng: -46.468 },
  '08331110': { lat: -23.6, lng: -46.468 },

  // Juliana Viana dos Santos (Rua Anecy Rocha, 1386, Jd Nova Vitoria)
  '08372-209': { lat: -23.621, lng: -46.445 },
  '08372209': { lat: -23.621, lng: -46.445 },

  // Willian Alves de Andrade (Tv Flaminio Bellini Carri, Recanto Verde do Sol)
  '08382-020': { lat: -23.63, lng: -46.438 },
  '08382020': { lat: -23.63, lng: -46.438 },

  // Noezio Junho Pinheiro (Rua Igarapé da Missão, 428, Cidade Tiradentes)
  '08485-010': { lat: -23.585, lng: -46.415 },
  '08485010': { lat: -23.585, lng: -46.415 },

  // Daniel Roberto Pizzino (Cidade Tiradentes)
  '08470-790': { lat: -23.59, lng: -46.41 },
  '08470790': { lat: -23.59, lng: -46.41 },

  // Tiago Oliveira Scarin (Jd Planalto)
  '03984-050': { lat: -23.604, lng: -46.512 },
  '03984050': { lat: -23.604, lng: -46.512 },

  // Lucas Barbosa dos Santos (Vila Carmosina/Itaquera)
  '08270-260': { lat: -23.545, lng: -46.452 },
  '08270260': { lat: -23.545, lng: -46.452 },

  // André Luiz Barbosa da Silva (Vila Nova Curuçá / São Miguel Paulista)
  '08030-590': { lat: -23.505, lng: -46.425 },
  '08030590': { lat: -23.505, lng: -46.425 },

  // Michelle Ferreira La Selva (Vila Nhocune / Artur Alvim)
  '03560-050': { lat: -23.54, lng: -46.495 },
  '03560050': { lat: -23.54, lng: -46.495 },

  // Joel Maurício dos Santos (Jardim Miriam / Itaim Paulista)
  '08141-004': { lat: -23.5, lng: -46.395 },
  '08141004': { lat: -23.5, lng: -46.395 },

  // Douglas Souza Berto (JD Colônia / Itaquera)
  '08260-140': { lat: -23.555, lng: -46.435 },
  '08260140': { lat: -23.555, lng: -46.435 },

  // Wilham Santana Costa (São Paulo - Itaquera)
  '08270-230': { lat: -23.547, lng: -46.454 },
  '08270230': { lat: -23.547, lng: -46.454 },

  // Gabriel Augusto Cândido da Silva (São Paulo - ZL)
  '08344-320': { lat: -23.602, lng: -46.448 },
  '08344320': { lat: -23.602, lng: -46.448 },

  // Cícero Rodrigues Monteiro (Vila São Silvestre / Rio Pequeno / Butantã - ZONA OESTE/SUL: muito mais próximo da Cursino que de Sapopemba!)
  // Coordenadas CEP 05366-220: lat -23.5760, lng -46.7450.
  // Distância até Cursino: ~15,3 km. Distância até Leandro de Sevilha (Sapopemba): ~24,3 km.
  '05366-220': { lat: -23.576, lng: -46.745 },
  '05366220': { lat: -23.576, lng: -46.745 },

  // Anthony Silva Nascimento
  '08340-190': { lat: -23.601, lng: -46.452 },
  '08340190': { lat: -23.601, lng: -46.452 },

  // Clayton Freire de lima
  '08380-010': { lat: -23.605, lng: -46.46 },
  '08380010': { lat: -23.605, lng: -46.46 },

  // Iverton Justino de Andrade
  '08341-350': { lat: -23.602, lng: -46.445 },
  '08341350': { lat: -23.602, lng: -46.445 },

  // Anthony Guimarães
  '03983-020': { lat: -23.607, lng: -46.514 },
  '03983020': { lat: -23.607, lng: -46.514 },
}
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const googleApiKey = Deno.env.get('GOOGLE_API_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Obter vagas de cobrador
    const { data: vagas, error: vagasErr } = await supabase
      .from('vagas')
      .select('id, titulo, criterios_qualificacao')
      .ilike('titulo', '%Cobrador%')

    if (vagasErr || !vagas || vagas.length === 0) {
      throw new Error('Vagas de cobrador não encontradas.')
    }

    const vagaCursino = vagas.find((v) => v.titulo.toLowerCase().includes('cursino'))
    const vagaLeste = vagas.find((v) => v.titulo.toLowerCase().includes('leste'))

    if (!vagaCursino || !vagaLeste) {
      throw new Error('Vagas Cobrador Cursino e Leste devem existir.')
    }

    // Coordenadas base
    const cursinoCoords: Coordinates = REFERENCE_LOCATIONS.cursino.approxCoords
    const sapopembaCoords: Coordinates = REFERENCE_LOCATIONS.sapopemba.approxCoords

    // Buscar todos os candidatos vinculados a vagas de cobrador
    // Buscar todos os candidatos vinculados a vagas de cobrador
    const { data: candidatos, error: candErr } = await supabase
      .from('candidatos')
      .select('id, nome, vaga_id, etapa_id, ativo_kanban, proximidade, dados_extraidos, user_id')
      .in('vaga_id', [vagaCursino.id, vagaLeste.id])

    if (candErr || !candidatos) {
      throw new Error(`Erro ao buscar candidatos: ${candErr?.message}`)
    }

    const realocados: any[] = []
    const mantidos: any[] = []
    const paraRevisao: any[] = []
    const pulados: any[] = []

    for (const cand of candidatos) {
      // Regra de segurança: Se não estiver ativo no Kanban ou estiver em etapa avançada (Contratado), pular
      if (cand.ativo_kanban === false) {
        pulados.push({
          id: cand.id,
          nome: cand.nome,
          motivo: 'Inativo no Kanban (ativo_kanban = false)',
        })
        continue
      }

      const enderecoStr =
        formatAddressString(cand.dados_extraidos?.endereco, cand.dados_extraidos) ||
        cand.dados_extraidos?.endereco ||
        ''
      const rawCep = extractCep(enderecoStr) || extractCep(cand.dados_extraidos?.cep)
      const cleanCep = rawCep ? rawCep.replace(/\D/g, '') : ''

      let coords: Coordinates | null = null

      if (rawCep && KNOWN_CEP_COORDS[rawCep]) {
        coords = KNOWN_CEP_COORDS[rawCep]
      } else if (cleanCep && KNOWN_CEP_COORDS[cleanCep]) {
        coords = KNOWN_CEP_COORDS[cleanCep]
      }

      // Se temos CEP com faixas conhecidas de SP
      if (!coords && cleanCep) {
        // Faixas CEP Zona Leste (03000-03999, 08000-08499):
        const cepPrefix = parseInt(cleanCep.substring(0, 3), 10)
        const cepFullNum = parseInt(cleanCep, 10)

        if ((cepPrefix >= 30 && cepPrefix <= 39) || (cepPrefix >= 80 && cepPrefix <= 84)) {
          coords = sapopembaCoords // Mais próximo da garagem Leste
        } else if (
          (cepPrefix >= 40 && cepPrefix <= 49) || // Zona Sul (Cursino, Ipiranga, Jabaquara, Sto Amaro)
          (cepPrefix >= 90 && cepPrefix <= 99) || // ABC Paulista (Diadema, SBC, Sto André)
          (cepPrefix >= 50 && cepPrefix <= 59) // Zona Oeste (Butantã, Rio Pequeno -> Cursino ~15km vs Leste ~25km)
        ) {
          coords = cursinoCoords
        }
      }

      // Fallback para coordenadas textuais se ainda não tem
      if (!coords && enderecoStr) {
        coords = getReferenceCoordsForText(enderecoStr)
      }

      if (!coords) {
        paraRevisao.push({
          id: cand.id,
          nome: cand.nome,
          vaga_atual: cand.vaga_id === vagaCursino.id ? 'Cursino' : 'Leste',
          motivo: 'Endereço/CEP ausente ou não geolocalizável',
        })
        continue
      }

      // Se temos coordenadas
      const distCursino = calculateHaversineDistance(coords, cursinoCoords)
      const distLeste = calculateHaversineDistance(coords, sapopembaCoords)
      const unidadeMaisProxima: 'cursino' | 'leste' = distLeste < distCursino ? 'leste' : 'cursino'

      const vagaAtual = cand.vaga_id === vagaCursino.id ? 'cursino' : 'leste'
      const targetVaga = unidadeMaisProxima === 'leste' ? vagaLeste : vagaCursino

      // Buscar última análise para verificar se precisa ser corrigida mesmo se já mantida na vaga correta
      const { data: ultAnaliseCand } = await supabase
        .from('analises')
        .select('id, resultado, detalhes')
        .eq('candidato_id', cand.id)
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle()

      const distGravada = (ultAnaliseCand?.detalhes as any)?.distancia_km
      const motivoGravado = String((ultAnaliseCand?.detalhes as any)?.motivo || '').toLowerCase()
      const temInconsistenciaDistancia =
        ultAnaliseCand?.resultado === 'nao_qualificado' &&
        distGravada !== undefined &&
        Number(distGravada) <= 20 &&
        (motivoGravado.includes('dist') ||
          motivoGravado.includes('localiz') ||
          motivoGravado.includes('raio') ||
          motivoGravado.includes('exced'))

      if (vagaAtual === unidadeMaisProxima && !temInconsistenciaDistancia) {
        // Já está na vaga correta e sem inconsistência! Atualizar campo proximidade se não estiver setado
        if (cand.proximidade !== (unidadeMaisProxima === 'leste' ? 'sapopemba' : 'cursino')) {
          await supabase
            .from('candidatos')
            .update({ proximidade: unidadeMaisProxima === 'leste' ? 'sapopemba' : 'cursino' })
            .eq('id', cand.id)
        }

        mantidos.push({
          id: cand.id,
          nome: cand.nome,
          unidade: unidadeMaisProxima,
          dist_cursino: distCursino ? distCursino.toFixed(1) : null,
          dist_leste: distLeste ? distLeste.toFixed(1) : null,
        })
      } else {
        // Realocação necessária!
        // 1. Atualizar candidato para a nova vaga_id e proximidade
        const proxLabel = unidadeMaisProxima === 'leste' ? 'sapopemba' : 'cursino'
        await supabase
          .from('candidatos')
          .update({
            vaga_id: targetVaga.id,
            proximidade: proxLabel,
          })
          .eq('id', cand.id)

        // 2. Invocar reanálise real de IA contra a vaga de destino
        const ultAnalise = ultAnaliseCand

        const menorDist = unidadeMaisProxima === 'leste' ? distLeste : distCursino
        const distFormatada = menorDist ? Number(menorDist.toFixed(1)) : 5.0

        // Em vez de apenas clonar detalhes antigos de outra garagem com distâncias errôneas,
        // invocar a reanálise real de IA através da edge function analisar-cv-criterios
        let analiseSucesso = false
        try {
          const reanaliseRes = await fetch(`${supabaseUrl}/functions/v1/analisar-cv-criterios`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${supabaseKey}`,
              apikey: supabaseKey,
            },
            body: JSON.stringify({
              cv_id: cand.id,
              vaga_id: targetVaga.id,
              user_id: cand.user_id,
            }),
          })
          const reanaliseData = await reanaliseRes.json()
          if (reanaliseData?.data?.analise) {
            analiseSucesso = true
          }
        } catch (callErr: any) {
          console.error(
            `Erro ao invocar analisar-cv-criterios para ${cand.nome}:`,
            callErr?.message,
          )
        }

        if (!analiseSucesso && ultAnalise) {
          const det = { ...ultAnalise.detalhes }
          det.distancia_km = distFormatada
          det.unidade_mais_proxima =
            unidadeMaisProxima === 'leste' ? 'Leste (Sapopemba)' : 'Cursino'
          det.reanalisado_por_proximidade = true

          await supabase
            .from('analises')
            .update({
              vaga_id: targetVaga.id,
              detalhes: det,
              criado_em: new Date().toISOString(),
            })
            .eq('id', ultAnalise.id)
        }

        realocados.push({
          id: cand.id,
          nome: cand.nome,
          de: vagaAtual,
          para: unidadeMaisProxima,
          endereco: enderecoStr,
          dist_cursino: distCursino ? distCursino.toFixed(1) : null,
          dist_leste: distLeste ? distLeste.toFixed(1) : null,
        })
      }

      await new Promise((r) => setTimeout(r, 50))
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total: candidatos.length,
          realocados_count: realocados.length,
          mantidos_count: mantidos.length,
          para_revisao_count: paraRevisao.length,
          pulados_count: pulados.length,
        },
        realocados,
        mantidos,
        para_revisao: paraRevisao,
        pulados,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

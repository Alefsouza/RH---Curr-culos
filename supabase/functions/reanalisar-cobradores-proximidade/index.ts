import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import {
  REFERENCE_LOCATIONS,
  calculateHaversineDistance,
  extractCep,
  geocodeAddress,
  formatAddressString,
  getReferenceCoordsForText,
  Coordinates,
} from '../_shared/proximity.ts'

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

    for (const cand of candidatos) {
      const enderecoStr =
        formatAddressString(cand.dados_extraidos?.endereco, cand.dados_extraidos) ||
        cand.dados_extraidos?.endereco ||
        ''
      const cep = extractCep(enderecoStr) || extractCep(cand.dados_extraidos?.cep)

      let coords: Coordinates | null = null

      if (enderecoStr && googleApiKey) {
        coords = await geocodeAddress(enderecoStr, googleApiKey)
      }

      // Fallback para coordenadas textuais se geocode falhou ou não tem googleApiKey
      if (!coords && enderecoStr) {
        coords = getReferenceCoordsForText(enderecoStr)
      }

      if (!coords && !cep) {
        paraRevisao.push({
          id: cand.id,
          nome: cand.nome,
          vaga_atual: cand.vaga_id === vagaCursino.id ? 'Cursino' : 'Leste',
          motivo: 'Endereço/CEP ausente ou não geolocalizável',
        })
        continue
      }

      // Se temos coordenadas
      let distCursino: number | null = null
      let distLeste: number | null = null
      let unidadeMaisProxima: 'cursino' | 'leste' | null = null

      if (coords) {
        distCursino = calculateHaversineDistance(coords, cursinoCoords)
        distLeste = calculateHaversineDistance(coords, sapopembaCoords)
        unidadeMaisProxima = distLeste < distCursino ? 'leste' : 'cursino'
      } else if (enderecoStr) {
        // Fallback por texto da região
        const ref = getReferenceCoordsForText(enderecoStr)
        if (ref === sapopembaCoords) {
          unidadeMaisProxima = 'leste'
          distLeste = 4.0
          distCursino = 15.0
        } else if (ref === cursinoCoords) {
          unidadeMaisProxima = 'cursino'
          distCursino = 4.0
          distLeste = 15.0
        }
      }

      if (!unidadeMaisProxima) {
        paraRevisao.push({
          id: cand.id,
          nome: cand.nome,
          vaga_atual: cand.vaga_id === vagaCursino.id ? 'Cursino' : 'Leste',
          motivo: 'Não foi possível determinar proximidade precisa',
        })
        continue
      }

      const vagaAtual = cand.vaga_id === vagaCursino.id ? 'cursino' : 'leste'
      const targetVaga = unidadeMaisProxima === 'leste' ? vagaLeste : vagaCursino

      if (vagaAtual === unidadeMaisProxima) {
        // Já está na vaga correta! Atualizar campo proximidade se não estiver setado
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

        // 2. Buscar análise recente para atualizar ou criar nova
        const { data: ultAnalise } = await supabase
          .from('analises')
          .select('id, resultado, detalhes')
          .eq('candidato_id', cand.id)
          .order('criado_em', { ascending: false })
          .limit(1)
          .maybeSingle()

        const menorDist = unidadeMaisProxima === 'leste' ? distLeste : distCursino
        const distFormatada = menorDist ? Number(menorDist.toFixed(1)) : 5.0

        if (ultAnalise) {
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
        },
        realocados,
        para_revisao,
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

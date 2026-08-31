import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import {
  determineProximity,
  geocodeAddress,
  REFERENCE_LOCATIONS,
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

    if (!googleApiKey) {
      return new Response(
        JSON.stringify({ error: 'GOOGLE_API_KEY não configurada no servidor.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    let body: any = {}
    try {
      const text = await req.text()
      if (text) body = JSON.parse(text)
    } catch {
      // payload vazio ou inválido ok para trigger geral
    }

    const forceAll = true

    // Geocodificar os dois endereços de referência para obter coordenadas exatas do Google Maps
    let cursinoCoords: Coordinates = REFERENCE_LOCATIONS.cursino.approxCoords
    let sapopembaCoords: Coordinates = REFERENCE_LOCATIONS.sapopemba.approxCoords

    const geoCursino = await geocodeAddress(REFERENCE_LOCATIONS.cursino.address, googleApiKey)
    if (geoCursino) cursinoCoords = geoCursino

    const geoSapopemba = await geocodeAddress(REFERENCE_LOCATIONS.sapopemba.address, googleApiKey)
    if (geoSapopemba) sapopembaCoords = geoSapopemba

    console.log('[Backfill Proximidade] Referências:', {
      cursino: cursinoCoords,
      sapopemba: sapopembaCoords,
    })

    // Buscar candidatos que possuem análise com resultado = 'qualificado'
    let query = supabase
      .from('candidatos')
      .select('id, nome, dados_extraidos, proximidade, analises!inner(resultado)')
      .eq('analises.resultado', 'qualificado')
      .not('dados_extraidos->endereco', 'is', null)

    if (!forceAll) {
      query = query.is('proximidade', null)
    }

    const { data: candidates, error: fetchErr } = await query

    if (fetchErr) {
      throw fetchErr
    }

    console.log(
      `[Backfill Proximidade] Encontrados ${candidates?.length || 0} candidatos para processar.`,
    )

    // Deduplica candidatos caso algum tenha mais de uma análise qualificada
    const uniqueCandidatesMap = new Map<string, any>()
    for (const cand of candidates || []) {
      if (cand?.id && !uniqueCandidatesMap.has(cand.id)) {
        uniqueCandidatesMap.set(cand.id, cand)
      }
    }
    const uniqueCandidates = Array.from(uniqueCandidatesMap.values())

    const results = {
      total: uniqueCandidates.length,
      updated: 0,
      cursino: 0,
      sapopemba: 0,
      nenhum: 0,
      erros: 0,
    }

    for (const cand of uniqueCandidates) {
      const endereco = cand.dados_extraidos?.endereco
      if (!endereco) continue

      try {
        const prox = await determineProximity(endereco, googleApiKey, {
          cursino: cursinoCoords,
          sapopemba: sapopembaCoords,
        })

        if (prox) {
          await supabase.from('candidatos').update({ proximidade: prox }).eq('id', cand.id)

          results.updated++
          if (prox === 'cursino') results.cursino++
          if (prox === 'sapopemba') results.sapopemba++
        } else {
          // Marca explicitamente como 'nenhum' ou mantém atualizado
          await supabase.from('candidatos').update({ proximidade: 'nenhum' }).eq('id', cand.id)

          results.nenhum++
        }

        // Pequena pausa para evitar rate limit na Geocoding API
        await new Promise((r) => setTimeout(r, 80))
      } catch (err: any) {
        console.error(`Erro ao processar candidato ${cand.id}:`, err?.message)
        results.erros++
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error: any) {
    console.error('Erro no backfill de proximidade:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    let body: any = {}
    try {
      body = await req.json()
    } catch {
      // Body opcional
    }

    const limit = body.limit || 50
    const offset = body.offset || 0

    // Buscar candidatos sem análise
    const { data: candidates, error } = await supabase
      .from('candidatos')
      .select('id, nome, vaga_id, user_id, curriculo_url')
      .order('criado_em', { ascending: false })

    if (error) {
      throw error
    }

    const { data: existingAnalises } = await supabase.from('analises').select('candidato_id')

    const analyzedSet = new Set((existingAnalises || []).map((a) => a.candidato_id))
    // Incluir candidatos sem análise OU com nomes desconhecidos/inválidos que precisam de reprocessamento
    const pendingCandidates = (candidates || []).filter((c) => {
      const isUnanalyzed = !analyzedSet.has(c.id)
      const isGenericName =
        !c.nome || /desconhecido|exemplo|string|sem nome|candidato$/i.test(c.nome.trim())
      return isUnanalyzed || isGenericName
    })

    // Ação direta para invocar reanalisar-candidato para Igor Mendonça Elói Da Silva
    if (body.reanalyzeIgor || req.headers.get('x-reanalyze-igor') === 'true') {
      console.log('[batch-reanalyze-all] Executando reanálise para Igor Mendonça Elói Da Silva...')
      const igorRes = await fetch(`${supabaseUrl}/functions/v1/reanalisar-candidato`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          candidate_id: '46ab0280-e34b-4d78-b333-1d42d0581415',
          force_reextract: body.force_reextract ?? true,
        }),
      })
      const igorText = await igorRes.text()
      let igorJson: any
      try {
        igorJson = JSON.parse(igorText)
      } catch {
        igorJson = { raw: igorText }
      }
      return new Response(JSON.stringify({ igorJson, ok: igorRes.ok, status: igorRes.status }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Ação direta para invocar reanalisar-candidato para Cícero Crisostomo dos Santos
    if (body.reanalyzeCicero) {
      console.log('[batch-reanalyze-all] Executando reanálise para Cícero Crisostomo dos Santos...')
      const ciceroRes = await fetch(`${supabaseUrl}/functions/v1/reanalisar-candidato`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          candidate_id: '0eb00581-a1db-4172-b761-a409dd02761e',
          force_reextract: false,
        }),
      })
      const ciceroText = await ciceroRes.text()
      let ciceroJson: any
      try {
        ciceroJson = JSON.parse(ciceroText)
      } catch {
        ciceroJson = { raw: ciceroText }
      }
      return new Response(
        JSON.stringify({ ciceroJson, ok: ciceroRes.ok, status: ciceroRes.status }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // Ação direta para invocar reanalisar-candidato para Leonardo Augusto Damasceno
    if (body.reanalyzeLeonardo) {
      console.log('[batch-reanalyze-all] Executando reanálise para Leonardo Augusto Damasceno...')
      const leonardoRes = await fetch(`${supabaseUrl}/functions/v1/reanalisar-candidato`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          candidate_id: '45251712-9216-42da-811c-4ba82e4fd993',
          force_reextract: false,
        }),
      })
      const leonardoJson = await leonardoRes.json()
      return new Response(
        JSON.stringify({ leonardoJson, ok: leonardoRes.ok, status: leonardoRes.status }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // Ação direta para invocar reanalisar-candidato para Eduardo Francisco de Freitas
    if (body.reanalyzeEduardo) {
      console.log('[batch-reanalyze-all] Executando reanálise para Eduardo Francisco de Freitas...')
      const eduardoRes = await fetch(`${supabaseUrl}/functions/v1/reanalisar-candidato`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          candidate_id: 'cdbbf741-e60d-451f-9427-fdbc79310a81',
          force_reextract: false,
        }),
      })
      const eduardoText = await eduardoRes.text()
      let eduardoJson: any
      try {
        eduardoJson = JSON.parse(eduardoText)
      } catch {
        eduardoJson = { raw: eduardoText }
      }
      return new Response(
        JSON.stringify({ eduardoJson, ok: eduardoRes.ok, status: eduardoRes.status }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // Ação direta para invocar reanalisar-candidato para Robisom com force_reextract
    if (body.reanalyzeRobisom) {
      console.log('[batch-reanalyze-all] Executando reanálise forçada para Robisom...')
      const robisomRes = await fetch(`${supabaseUrl}/functions/v1/reanalisar-candidato`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          candidate_id: 'ad3f9fe5-905a-4e7e-adce-a803772da937',
          force_reextract: true,
        }),
      })
      const robisomJson = await robisomRes.json()
      return new Response(
        JSON.stringify({ robisomJson, ok: robisomRes.ok, status: robisomRes.status }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // Trigger auxiliar para rodar o backfill de proximidade se solicitado
    if (body.runBackfillProximity) {
      console.log('Disparando backfill-proximidade via batch-reanalyze-all...')
      const proxRes = await fetch(`${supabaseUrl}/functions/v1/backfill-proximidade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          forceAll: body.forceAll ?? true,
          limit: body.limit || 500,
          offset: body.offset || 0,
        }),
      })
      const proxData = await proxRes.json()
      return new Response(JSON.stringify({ proxData }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (body.candidate_id) {
      console.log(
        `[batch-reanalyze-all] Executando reanálise direta para candidato único ${body.candidate_id}`,
      )
      const res = await fetch(`${supabaseUrl}/functions/v1/reanalisar-candidato`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          candidate_id: body.candidate_id,
          vaga_id: body.vaga_id,
          force_reextract: body.force_reextract || false,
        }),
      })
      const resJson = await res.json()
      return new Response(
        JSON.stringify({ singleCandidate: true, status: res.status, ok: res.ok, data: resJson }),
        {
          status: res.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const totalPending = pendingCandidates.length
    const batch = pendingCandidates.slice(offset, offset + limit)

    console.log(
      `Reanalisando lote: ${batch.length} de ${totalPending} pendentes (offset ${offset}, limit ${limit})...`,
    )

    const results = {
      total_pending_before: totalPending,
      processed: 0,
      success: 0,
      errors: 0,
      details: [] as any[],
    }

    // Processar candidatos do lote em paralelo (com concorrência controlada)
    const BATCH_CONCURRENCY = 5
    for (let i = 0; i < batch.length; i += BATCH_CONCURRENCY) {
      const subBatch = batch.slice(i, i + BATCH_CONCURRENCY)
      const settled = await Promise.allSettled(
        subBatch.map(async (candidate) => {
          const res = await fetch(`${supabaseUrl}/functions/v1/reanalisar-candidato`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({ candidate_id: candidate.id }),
          })
          const resJson = await res.json()
          if (!res.ok || resJson.error) {
            throw new Error(resJson.error || `HTTP ${res.status}`)
          }
          return { candidateId: candidate.id, nome: candidate.nome, data: resJson }
        }),
      )

      for (let j = 0; j < settled.length; j++) {
        results.processed++
        const item = settled[j]
        const cand = subBatch[j]
        if (item.status === 'fulfilled') {
          results.success++
          results.details.push({
            id: cand.id,
            nome: cand.nome,
            status: 'success',
          })
        } else {
          results.errors++
          results.details.push({
            id: cand.id,
            nome: cand.nome,
            status: 'error',
            error: item.reason?.message || String(item.reason),
          })
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, results, remaining: totalPending - results.processed }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (err: any) {
    console.error('Erro em batch-reanalyze-all:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

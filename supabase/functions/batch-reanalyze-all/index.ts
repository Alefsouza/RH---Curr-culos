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

    // Filtrar candidatos sem analise
    const { data: existingAnalises } = await supabase.from('analises').select('candidato_id')

    const analyzedSet = new Set((existingAnalises || []).map((a) => a.candidato_id))
    const pendingCandidates = (candidates || []).filter((c) => !analyzedSet.has(c.id))

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

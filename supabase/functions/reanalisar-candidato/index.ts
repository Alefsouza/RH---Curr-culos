import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const { candidate_id } = body

    if (!candidate_id) {
      return new Response(JSON.stringify({ error: 'candidate_id é obrigatório.' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: candidato, error } = await supabase
      .from('candidatos')
      .select('id, vaga_id, user_id')
      .eq('id', candidate_id)
      .single()

    if (error || !candidato) {
      return new Response(
        JSON.stringify({ error: 'Candidato não encontrado. Verifique o ID e tente novamente.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    let effectiveUserId = candidato.user_id
    if (!effectiveUserId) {
      const { data: adminUser } = await supabase
        .from('usuarios')
        .select('id')
        .order('criado_em', { ascending: true })
        .limit(1)
        .maybeSingle()
      effectiveUserId = adminUser?.id || ''
    }

    let vagaId = candidato.vaga_id

    if (!vagaId) {
      const identifyRes = await fetch(`${supabaseUrl}/functions/v1/identify-vaga-from-cv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseKey}` },
        body: JSON.stringify({ candidato_id: candidato.id, user_id: effectiveUserId }),
      })

      const identifyData = await identifyRes.json()

      if (identifyData.error) {
        return new Response(JSON.stringify({ error: identifyData.error }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (identifyData.vaga_id) {
        const { error: updateError } = await supabase
          .from('candidatos')
          .update({ vaga_id: identifyData.vaga_id })
          .eq('id', candidato.id)

        if (updateError) {
          return new Response(JSON.stringify({ error: 'Erro ao vincular vaga ao candidato.' }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        vagaId = identifyData.vaga_id
      } else {
        return new Response(
          JSON.stringify({
            error: 'Nenhuma vaga compatível encontrada para o candidato.',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    const analyzeRes = await fetch(`${supabaseUrl}/functions/v1/analisar-cv-criterios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseKey}` },
      body: JSON.stringify({
        cv_id: candidato.id,
        vaga_id: vagaId,
        user_id: effectiveUserId,
      }),
    })

    const analyzeData = await analyzeRes.json()

    if (analyzeData.error) {
      return new Response(JSON.stringify({ error: analyzeData.error }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, data: analyzeData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Erro interno no servidor.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

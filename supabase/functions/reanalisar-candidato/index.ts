import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const { candidate_id } = body

    if (!candidate_id) {
      return new Response(JSON.stringify({ error: 'candidate_id é obrigatório' }), {
        status: 400,
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
      return new Response(JSON.stringify({ error: 'Candidato não encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!candidato.vaga_id) {
      return new Response(JSON.stringify({ error: 'Candidato não possui vaga associada' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const analyzeRes = await fetch(`${supabaseUrl}/functions/v1/analisar-cv-criterios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseKey}` },
      body: JSON.stringify({
        cv_id: candidato.id,
        vaga_id: candidato.vaga_id,
        user_id: candidato.user_id,
      }),
    })

    const analyzeData = await analyzeRes.json()

    if (analyzeData.error) {
      return new Response(JSON.stringify({ error: analyzeData.error }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, data: analyzeData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Buscar todos os candidatos sem vaga (recuperados do storage)
    const { data: candidatos, error: queryError } = await supabaseAdmin
      .from('candidatos')
      .select('id, nome')
      .is('vaga_id', null)
      .eq('fonte', 'recuperacao_storage')

    if (queryError) throw new Error(`Erro ao buscar candidatos: ${queryError.message}`)

    if (!candidatos || candidatos.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Nenhum candidato pendente encontrado',
          total: 0,
        }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        },
      )
    }

    const total = candidatos.length
    let sucessos = 0
    let falhas = 0
    const detalhes: Array<{ id: string; nome: string; status: string; erro?: string }> = []

    // 2. Processar em lotes de 5
    const batchSize = 5
    for (let i = 0; i < candidatos.length; i += batchSize) {
      const batch = candidatos.slice(i, i + batchSize)

      const results = await Promise.allSettled(
        batch.map(async (c) => {
          const { error } = await supabaseAdmin.functions.invoke('reanalisar-candidato', {
            body: { candidate_id: c.id },
          })
          if (error) throw new Error(error.message)
          return c
        }),
      )

      for (let j = 0; j < results.length; j++) {
        const r = results[j]
        const c = batch[j]
        if (r.status === 'fulfilled') {
          sucessos++
          detalhes.push({ id: c.id, nome: c.nome, status: 'sucesso' })
        } else {
          falhas++
          detalhes.push({
            id: c.id,
            nome: c.nome,
            status: 'falha',
            erro: (r.reason as Error)?.message || 'Erro desconhecido',
          })
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total,
        sucessos,
        falhas,
        detalhes,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : 'Erro desconhecido',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      },
    )
  }
})

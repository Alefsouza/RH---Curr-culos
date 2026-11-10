/**
 * Reanálise em lote de candidatos com motivo_inativo='erro_reanalise'.
 * Apenas candidatos NÃO excluídos (deleted_at IS NULL) são reanalisados — excluídos
 * permanecem no estado de erro (histórico preservado) e seguem invisíveis por design.
 * Para cada candidato, chama reanalisar-candidato (a MESMA mecânica do lote de
 * reanálise v0.0.692: geocodificação com sanidade, distância real, todas as vagas da
 * família do cargo, melhor encaixe; fora do raio de todas → aguardando COM análise).
 * V0.0.701.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const PROTEGIDOS_PREFIXOS = [
  '3c9a24ae', // Daniel
  '46ab0280', // Igor
  '18cb75de', // Cristiano
  'cdbbf741', // Eduardo
  '548de618', // João Rafael
]

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const supabase = createClient(supabaseUrl, serviceKey)

  try {
    let body: any = {}
    try {
      body = await req.json()
    } catch {
      // corpo opcional
    }

    const dryRun = body?.dryRun === true
    const maxBatch = Number(body?.limit) || 100

    // 1. Candidatos em erro_reanalise, NÃO excluídos, fora dos protegidos
    const { data: candidatos, error: fetchErr } = await supabase
      .from('candidatos')
      .select('id, nome, email, vaga_id, etapa_id')
      .eq('motivo_inativo', 'erro_reanalise')
      .is('deleted_at', null)
      .order('id')
      .limit(maxBatch)

    if (fetchErr) throw new Error(`Falha ao buscar candidatos: ${fetchErr.message}`)

    const protegidos = (candidatos || []).filter((c) =>
      PROTEGIDOS_PREFIXOS.some((p) => (c.id as string).startsWith(p)),
    )
    const alvo = (candidatos || []).filter(
      (c) => !PROTEGIDOS_PREFIXOS.some((p) => (c.id as string).startsWith(p)),
    )

    console.log(
      `[reanalisar-erro-reanalise] ${candidatos?.length || 0} em erro_reanalise (não excluídos); ` +
        `${alvo.length} a reanalisar, ${protegidos.length} protegido(s) intocado(s).`,
    )

    // 2. Reanalisar cada um com a MESMA mecânica do lote (reanalisar-candidato)
    const resultados: any[] = []
    for (const c of alvo) {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/reanalisar-candidato`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            candidate_id: c.id,
            // dados_extraidos já persistidos: não forçar reextração do PDF (custo/tempo)
            force_reextract: false,
          }),
        })
        const txt = await res.text()
        let json: any
        try {
          json = JSON.parse(txt)
        } catch {
          json = { raw: txt.slice(0, 500) }
        }
        const estado =
          json?.data?.candidato_atualizado?.motivo_inativo ??
          json?.candidato_atualizado?.motivo_inativo ??
          json?.motivo_inativo ??
          null
        resultados.push({
          candidato_id: c.id,
          nome: c.nome,
          http: res.status,
          estado_final: estado,
          ok: res.ok,
        })
        console.log(
          `[reanalisar-erro-reanalise] ${c.nome}: HTTP ${res.status}, estado=${estado ?? '?'}`,
        )
      } catch (e: any) {
        console.error(`[reanalisar-erro-reanalise] Falha ${c.nome}:`, e?.message)
        resultados.push({ candidato_id: c.id, nome: c.nome, ok: false, error: e?.message })
      }
    }

    // 3. Estado final: o que ficou em erro_reanalise após o lote
    const { data: restantes } = await supabase
      .from('candidatos')
      .select('id, nome, deleted_at')
      .eq('motivo_inativo', 'erro_reanalise')

    return new Response(
      JSON.stringify({
        ok: true,
        total_em_erro: candidatos?.length || 0,
        protegidos_intocados: protegidos.map((p) => p.id),
        reanalisados: resultados,
        restantes_em_erro: (restantes || []).map((r) => ({
          id: r.id,
          nome: r.nome,
          excluido: !!r.deleted_at,
        })),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('[reanalisar-erro-reanalise] Erro geral:', err?.message || err)
    return new Response(JSON.stringify({ ok: false, error: err?.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

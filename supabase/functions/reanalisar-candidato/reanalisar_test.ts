import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.test('Invocar reanálise do André Luiz Dos Santos e verificar resultado', async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const candidateId = 'f1a2b4c2-314e-4e9e-a8ed-2ad98af3f72e'

  console.log(`[TEST] Disparando reanálise para o candidato ${candidateId}...`)

  const response = await fetch(`${supabaseUrl}/functions/v1/reanalisar-candidato`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ candidate_id: candidateId }),
  })

  const resJson = await response.json()
  console.log('[TEST] Resposta da função reanalisar-candidato:', JSON.stringify(resJson, null, 2))

  // Consultar no banco os dados atualizados do candidato e da análise
  const { data: cand, error: candErr } = await supabase
    .from('candidatos')
    .select('id, nome, email, telefone, vaga_id, vagas(id, titulo)')
    .eq('id', candidateId)
    .single()

  if (candErr) throw candErr

  const { data: analises, error: analErr } = await supabase
    .from('analises')
    .select('id, vaga_id, resultado, detalhes, criado_em, vagas(id, titulo)')
    .eq('candidato_id', candidateId)
    .order('criado_em', { ascending: false })

  if (analErr) throw analErr

  console.log('[TEST] Candidato no banco:', JSON.stringify(cand, null, 2))
  console.log('[TEST] Análises no banco:', JSON.stringify(analises, null, 2))
})

// scripts/reanalyze-henrique.mjs
// Dispara a reanálise do candidato Henrique Amâncio via Edge Function reanalisar-candidato

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://egferpbppisambawnhke.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || ''

const CANDIDATE_ID = 'e8e5d96f-6d4c-4b60-91e0-a06d746fdbf2'

async function main() {
  console.log(`[reanalyze-henrique] Iniciando reanálise para candidato: ${CANDIDATE_ID}`)
  console.log(`[reanalyze-henrique] URL: ${SUPABASE_URL}`)

  if (!SERVICE_KEY) {
    console.error('ERRO: SUPABASE_SERVICE_ROLE_KEY não configurada no ambiente.')
    process.exit(1)
  }

  const endpoint = `${SUPABASE_URL}/functions/v1/reanalisar-candidato`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify({
      candidate_id: CANDIDATE_ID,
      force_reextract: false,
    }),
  })

  const status = response.status
  const text = await response.text()
  console.log(`[reanalyze-henrique] Status HTTP: ${status}`)
  console.log(`[reanalyze-henrique] Resposta:`, text)

  if (!response.ok) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[reanalyze-henrique] Erro:', err)
  process.exit(1)
})

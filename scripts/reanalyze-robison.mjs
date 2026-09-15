// scripts/reanalyze-robison.mjs
// Dispara a reanálise do candidato Robison Alves de Lima Mello com force_reextract: true

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://egferpbppisambawnhke.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || ''
const CANDIDATE_ID = 'ad3f9fe5-905a-4e7e-adce-a803772da937'

async function main() {
  console.log(`[reanalyze-robison] Iniciando reanálise para candidato: ${CANDIDATE_ID}`)
  console.log(`[reanalyze-robison] URL: ${SUPABASE_URL}`)
  console.log(`[reanalyze-robison] SERVICE_KEY presente? ${Boolean(SERVICE_KEY)}`)

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
      force_reextract: true,
    }),
  })

  const status = response.status
  const text = await response.text()
  console.log(`[reanalyze-robison] Status HTTP: ${status}`)
  console.log(`[reanalyze-robison] Resposta:`, text)
}

main().catch((err) => {
  console.error('[reanalyze-robison] Erro:', err)
})

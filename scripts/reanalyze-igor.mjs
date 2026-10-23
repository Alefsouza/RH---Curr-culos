// scripts/reanalyze-igor.mjs
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://egferpbppisambawnhke.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const CANDIDATE_ID = '46ab0280-e34b-4d78-b333-1d42d0581415'

console.log('[reanalyze-igor] URL:', SUPABASE_URL)
console.log('[reanalyze-igor] SERVICE_KEY present?:', Boolean(SERVICE_KEY))

if (SERVICE_KEY) {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data, error } = await supabase.functions.invoke('reanalisar-candidato', {
    body: {
      candidate_id: CANDIDATE_ID,
      force_reextract: true,
    },
  })
  console.log('[reanalyze-igor] Invoke result:', { data, error })
} else {
  console.log('[reanalyze-igor] No SERVICE_KEY found in process.env')
}

import { supabase } from '@/lib/supabase/client'

export async function getSyncRuns() {
  const { data, error } = await supabase
    .from('sync_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data
}

export async function triggerOutlookSync() {
  const { data, error } = await supabase.functions.invoke('sync-outlook-cvs', { body: {} })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export async function triggerLeonardoReanalysis() {
  const { data, error } = await supabase.functions.invoke('reanalisar-candidato', {
    body: {
      candidate_id: '45251712-9216-42da-811c-4ba82e4fd993',
      force_reextract: false,
    },
  })
  if (error) throw error
  return data
}

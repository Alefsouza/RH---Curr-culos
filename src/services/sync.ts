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

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

export async function triggerCandidateReanalysis(candidateId: string, forceReextract = true) {
  const { data, error } = await supabase.functions.invoke('sync-outlook-cvs', {
    body: {
      reanalyzeCandidateId: candidateId,
      force_reextract: forceReextract,
    },
  })
  if (error) throw error
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
export async function triggerCobradoresProximidadeReanalysis() {
  const { data, error } = await supabase.functions.invoke('reanalisar-cobradores-proximidade', {
    body: {},
  })
  if (error) throw error
  return data
}

export async function triggerAuditAndReclassifyGenerics(
  candidateIds?: string[],
  options?: { batchLimit?: number; batchOffset?: number },
) {
  const { data, error } = await supabase.functions.invoke('sync-outlook-cvs', {
    body: {
      auditAndReclassifyGenerics: true,
      candidateIds: candidateIds || [],
      batchLimit: options?.batchLimit || 30,
      batchOffset: options?.batchOffset || 0,
    },
  })
  if (error) throw error
  return data
}

export async function runAuditoriaBatchAllGenerics(params?: {
  startOffset?: number
  maxTotal?: number
  batchSize?: number
}) {
  const { data, error } = await supabase.functions.invoke('sync-outlook-cvs', {
    body: {
      runAuditoriaBatchAllGenerics: true,
      startOffset: params?.startOffset ?? 0,
      maxTotal: params?.maxTotal ?? 30,
      batchSize: params?.batchSize ?? 15,
    },
  })
  if (error) throw error
  return data
}

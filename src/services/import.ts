import { supabase } from '@/lib/supabase/client'

export async function uploadResume(file: File, userId: string): Promise<string> {
  const fileExt = file.name.split('.').pop()
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
  const filePath = `${userId}/${fileName}`

  const { error } = await supabase.storage
    .from('curriculos')
    .upload(filePath, file, { cacheControl: '3600', upsert: false })

  if (error) throw new Error('Falha ao enviar o arquivo para o servidor.')
  return filePath
}

export async function processResume(filePath: string, userId: string) {
  const { data, error } = await supabase.functions.invoke('process-resume', {
    body: { filePath, user_id: userId },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export async function analyzeResumePublic(filePath: string, userId: string) {
  const { data, error } = await supabase.functions.invoke('analyze-resume', {
    body: { filePath, user_id: userId },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export async function identifyAndAssignVaga(candidatoId: string, userId: string) {
  const { data, error } = await supabase.functions.invoke('identify-vaga-from-cv', {
    body: { candidato_id: candidatoId, user_id: userId },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)

  if (data.vaga_id) {
    await supabase.from('candidatos').update({ vaga_id: data.vaga_id }).eq('id', candidatoId)
    try {
      await supabase.functions.invoke('analisar-cv-criterios', {
        body: { cv_id: candidatoId, vaga_id: data.vaga_id, user_id: userId },
      })
    } catch {
      // analysis failure is non-critical — vaga was still assigned
    }
  }
  return data as { vaga_id: string | null; confianca: string; justificativa: string }
}

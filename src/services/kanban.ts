import { supabase } from '@/lib/supabase/client'

export async function fetchStages() {
  const { data, error } = await supabase
    .from('etapas')
    .select('*')
    .order('ordem', { ascending: true })
  if (error) throw error
  return data.map((d) => ({
    id: d.id,
    name: d.nome,
    color: d.cor || 'bg-slate-200',
    order: d.ordem,
  }))
}

export async function fetchCandidates() {
  const { data, error } = await supabase.from('candidatos').select(`
    *,
    vagas ( titulo )
  `)
  if (error) throw error
  return data.map((d) => ({
    id: d.id,
    name: d.nome,
    email: d.email || '',
    phone: d.telefone || '',
    source: d.fonte || 'Site',
    stageId: d.etapa_id || '',
    job: (d.vagas as any)?.titulo || 'Sem Vaga',
    appliedAt: d.criado_em,
  }))
}

export async function updateCandidateStage(candidateId: string, stageId: string) {
  const { error } = await supabase
    .from('candidatos')
    .update({ etapa_id: stageId })
    .eq('id', candidateId)
  if (error) throw error

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (session) {
      // Tenta enviar a mensagem automática via WhatsApp em background
      supabase.functions
        .invoke('enviar-whatsapp', {
          body: { candidato_id: candidateId, etapa_id: stageId },
        })
        .catch(console.error)
    }
  } catch (e) {
    console.error('Erro ao invocar envio de WhatsApp:', e)
  }
}

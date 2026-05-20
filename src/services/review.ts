import { supabase } from '@/lib/supabase/client'

export async function getPendingReviews(filters?: {
  vaga_id?: string
  startDate?: string
  endDate?: string
}) {
  let query = supabase
    .from('analises')
    .select(`
      id,
      resultado,
      detalhes,
      criado_em,
      candidato_id,
      vaga_id,
      candidatos (
        id,
        nome,
        email,
        telefone,
        dados_extraidos,
        curriculo_url
      ),
      vagas (
        id,
        titulo
      )
    `)
    .eq('resultado', 'revisar')
    .order('criado_em', { ascending: true })

  if (filters?.vaga_id && filters.vaga_id !== 'all') {
    query = query.eq('vaga_id', filters.vaga_id)
  }
  if (filters?.startDate) {
    query = query.gte('criado_em', filters.startDate)
  }
  if (filters?.endDate) {
    const end = new Date(filters.endDate)
    end.setDate(end.getDate() + 1)
    query = query.lt('criado_em', end.toISOString())
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function fetchVagas() {
  const { data, error } = await supabase
    .from('vagas')
    .select('id, titulo')
    .order('criado_em', { ascending: false })
  if (error) throw error
  return data
}

export async function fetchEtapas() {
  const { data, error } = await supabase
    .from('etapas')
    .select('id, nome, cor')
    .order('ordem', { ascending: true })
  if (error) throw error
  return data
}

export async function updateReview(
  analiseId: string,
  candidatoId: string,
  novoResultado: string,
  notas: string,
  novaEtapaId: string | null,
  user: any,
) {
  const { data: analise, error: getError } = await supabase
    .from('analises')
    .select('detalhes')
    .eq('id', analiseId)
    .single()
  if (getError) throw getError

  const detalhes = (typeof analise?.detalhes === 'object' ? analise.detalhes : {}) as any
  const log = {
    revisado_em: new Date().toISOString(),
    revisado_por: user.id,
    revisado_por_nome: user.user_metadata?.name || user.email || 'Admin',
    notas,
    status_anterior: 'revisar',
    novo_status: novoResultado,
  }

  const novosDetalhes = {
    ...detalhes,
    revisao_rh: log,
  }

  const { error: updateError } = await supabase
    .from('analises')
    .update({
      resultado: novoResultado,
      detalhes: novosDetalhes,
    })
    .eq('id', analiseId)

  if (updateError) throw updateError

  if (novaEtapaId) {
    const { error: insertError } = await supabase.from('candidato_etapa').insert({
      candidato_id: candidatoId,
      etapa_id: novaEtapaId,
      usuario_id: user.id,
    })
    if (insertError) throw insertError

    const { error: candError } = await supabase
      .from('candidatos')
      .update({ etapa_id: novaEtapaId })
      .eq('id', candidatoId)
    if (candError) throw candError
  }
}

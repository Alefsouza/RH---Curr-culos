import { supabase } from '@/lib/supabase/client'
import { resolveCandidateStatus } from '@/services/candidates'

export async function getPendingReviews(filters?: {
  vaga_id?: string
  startDate?: string
  endDate?: string
}) {
  let query = supabase
    .from('candidatos')
    .select(`
      id,
      nome,
      email,
      telefone,
      dados_extraidos,
      curriculo_url,
      vaga_id,
      criado_em,
      analises (
        id,
        resultado,
        detalhes,
        criado_em,
        candidato_id,
        vaga_id
      ),
      vagas (
        id,
        titulo
      )
    `)
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

  const pendingReviews: any[] = []

  for (const c of data || []) {
    const analises = Array.isArray(c.analises) ? c.analises : []
    const status = resolveCandidateStatus(analises, c.vaga_id)

    if (status === 'revisar') {
      const sortedAnalises = [...analises].sort(
        (a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime(),
      )

      let currentAnalise: any = null
      if (c.vaga_id) {
        currentAnalise = sortedAnalises.find((a) => a.vaga_id === c.vaga_id)
      }
      if (!currentAnalise) {
        currentAnalise = sortedAnalises[0]
      }

      if (currentAnalise) {
        pendingReviews.push({
          id: currentAnalise.id,
          resultado: currentAnalise.resultado,
          detalhes: currentAnalise.detalhes,
          criado_em: currentAnalise.criado_em,
          candidato_id: c.id,
          vaga_id: c.vaga_id,
          candidatos: {
            id: c.id,
            nome: c.nome,
            email: c.email,
            telefone: c.telefone,
            dados_extraidos: c.dados_extraidos,
            curriculo_url: c.curriculo_url,
          },
          vagas: c.vagas,
        })
      }
    }
  }

  return pendingReviews
}

export async function fetchVagas() {
  try {
    const { data, error } = await supabase
      .from('vagas')
      .select('id, titulo, ativa')
      .order('criado_em', { ascending: false })
    if (error) {
      console.error('Erro ao buscar vagas:', error)
      return []
    }
    return (data || []).map((v: any) => ({
      id: v.id,
      titulo: v.titulo,
      ativa: v.ativa ?? true,
    }))
  } catch (error) {
    console.error('Falha de rede ao buscar vagas:', error)
    return []
  }
}

export async function fetchEtapas() {
  try {
    const { data, error } = await supabase
      .from('etapas')
      .select('id, nome, cor')
      .order('ordem', { ascending: true })
    if (error) {
      console.error('Erro ao buscar etapas:', error)
      return []
    }
    return data || []
  } catch (error) {
    console.error('Falha de rede ao buscar etapas:', error)
    return []
  }
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

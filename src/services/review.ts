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
    .is('duplicado_de', null)
    .is('deleted_at', null)
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
  novaVagaId?: string | null,
) {
  const [{ data: analise, error: getError }, { data: candidatoAtual, error: candGetError }] =
    await Promise.all([
      supabase.from('analises').select('detalhes, vaga_id').eq('id', analiseId).single(),
      supabase
        .from('candidatos')
        .select('id, vaga_id, etapa_id, ativo_kanban, motivo_inativo')
        .eq('id', candidatoId)
        .single(),
    ])

  if (getError) throw getError
  if (candGetError) throw candGetError

  const vagaAnterior = candidatoAtual?.vaga_id || analise?.vaga_id || null
  const vagaFinal = novaVagaId !== undefined ? novaVagaId : vagaAnterior

  const detalhes = (typeof analise?.detalhes === 'object' ? analise.detalhes : {}) as any
  const log: Record<string, any> = {
    revisado_em: new Date().toISOString(),
    revisado_por: user?.id,
    revisado_por_nome: user?.user_metadata?.name || user?.email || 'Admin',
    notas,
    status_anterior: 'revisar',
    novo_status: novoResultado,
    vaga_anterior: vagaAnterior,
    vaga_definida_por_rh: vagaFinal,
  }

  const novosDetalhes = {
    ...detalhes,
    revisao_rh: log,
  }

  const analiseUpdatePayload: {
    resultado: string
    detalhes: any
    vaga_id?: string | null
  } = {
    resultado: novoResultado,
    detalhes: novosDetalhes,
  }

  if (vagaFinal) {
    analiseUpdatePayload.vaga_id = vagaFinal
  }

  const { error: updateError } = await supabase
    .from('analises')
    .update(analiseUpdatePayload)
    .eq('id', analiseId)

  if (updateError) throw updateError

  // Determinar etapa final caso não tenha sido informada explicitamente
  let etapaFinalId = novaEtapaId

  if (!etapaFinalId && novoResultado === 'qualificado' && !candidatoAtual?.etapa_id) {
    // Se o candidato está sendo qualificado e ainda não tem etapa, mover para Triagem (ou primeira etapa)
    const { data: triagemEtapa } = await supabase
      .from('etapas')
      .select('id')
      .ilike('nome', 'Triagem')
      .limit(1)
      .maybeSingle()

    if (triagemEtapa?.id) {
      etapaFinalId = triagemEtapa.id
    } else {
      const { data: firstEtapa } = await supabase
        .from('etapas')
        .select('id')
        .order('ordem', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (firstEtapa?.id) {
        etapaFinalId = firstEtapa.id
      }
    }
  }

  // Atualizar candidato
  const candUpdatePayload: {
    vaga_id?: string | null
    etapa_id?: string | null
    ativo_kanban?: boolean | null
    motivo_inativo?: string | null
  } = {}

  if (novaVagaId !== undefined) {
    candUpdatePayload.vaga_id = novaVagaId
  }

  if (etapaFinalId) {
    candUpdatePayload.etapa_id = etapaFinalId
  }

  if (novoResultado === 'qualificado') {
    candUpdatePayload.ativo_kanban = true
    candUpdatePayload.motivo_inativo = null
  } else if (novoResultado === 'nao_qualificado') {
    candUpdatePayload.ativo_kanban = false
    candUpdatePayload.motivo_inativo = 'Não Qualificado'
  }

  if (Object.keys(candUpdatePayload).length > 0) {
    const { error: candError } = await supabase
      .from('candidatos')
      .update(candUpdatePayload)
      .eq('id', candidatoId)
    if (candError) throw candError
  }

  if (etapaFinalId && etapaFinalId !== candidatoAtual?.etapa_id) {
    const { error: insertError } = await supabase.from('candidato_etapa').insert({
      candidato_id: candidatoId,
      etapa_id: etapaFinalId,
      usuario_id: user?.id,
    })
    if (insertError) {
      console.error('Erro ao inserir histórico de etapa:', insertError)
    }
  }
}

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

type CandidateWithRelations = {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  fonte: string | null
  etapa_id: string | null
  criado_em: string
  proximidade?: 'cursino' | 'sapopemba' | 'nenhum' | null
  vagas: { titulo: string } | { titulo: string }[] | null
  analises: { resultado: string | null; detalhes: any; criado_em: string }[] | null
}

export async function fetchCandidates() {
  const { data, error } = await supabase
    .from('candidatos')
    .select(`
      *,
      vagas (titulo),
      analises (vaga_id, resultado, detalhes, criado_em)
    `)
    .neq('ativo_kanban', false)
    .order('criado_em', { ascending: false })
  if (error) throw error

  return (data as unknown as CandidateWithRelations[])
    .filter((d) => {
      const sortedAnalises = d.analises
        ? [...d.analises].sort(
            (a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime(),
          )
        : []

      const vagaId = (d as any).vaga_id
      let latestIa = sortedAnalises[0]
      if (vagaId) {
        const analiseVaga = sortedAnalises.find((a: any) => a.vaga_id === vagaId)
        if (analiseVaga) latestIa = analiseVaga
      }

      return latestIa?.resultado === 'qualificado'
    })
    .map((d) => {
      const sortedAnalises = d.analises
        ? [...d.analises].sort(
            (a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime(),
          )
        : []
      const latestIa = sortedAnalises[0]

      return {
        id: d.id,
        name: d.nome,
        email: d.email || '',
        phone: d.telefone || '',
        source: d.fonte || 'Site',
        stageId: d.etapa_id || '',
        job: d.vagas ? (Array.isArray(d.vagas) ? d.vagas[0]?.titulo : d.vagas.titulo) : 'Sem Vaga',
        vagaId: (d as any).vaga_id || null,
        appliedAt: d.criado_em,
        criado_em: d.criado_em,
        analysisResult: latestIa?.resultado || null,
        analysisDetails: latestIa?.detalhes || null,
        proximidade: (d as any).proximidade || null,
      }
    })
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
      // Registrar no histórico de etapas do candidato
      await supabase.from('candidato_etapa').insert({
        candidato_id: candidateId,
        etapa_id: stageId,
        usuario_id: session.user.id,
      })
    }
  } catch (e) {
    console.error('Erro ao salvar histórico de etapas:', e)
  }
}

export async function removeFromKanban(candidateId: string, vagaId?: string | null) {
  // 1. Marcar no candidato como inativo no Kanban
  const { error: candError } = await supabase
    .from('candidatos')
    .update({
      ativo_kanban: false,
      motivo_inativo: 'Retirado Kanban',
    })
    .eq('id', candidateId)

  if (candError) throw candError

  // 2. Se houver usuário autenticado, atualizar ou criar análise com status 'retirado_kanban'
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    let targetVagaId = vagaId
    if (!targetVagaId) {
      const { data: cand } = await supabase
        .from('candidatos')
        .select('vaga_id')
        .eq('id', candidateId)
        .maybeSingle()
      targetVagaId = cand?.vaga_id || null
    }

    if (targetVagaId) {
      const { data: existing } = await supabase
        .from('analises')
        .select('id, detalhes')
        .eq('candidato_id', candidateId)
        .eq('vaga_id', targetVagaId)
        .maybeSingle()

      if (existing) {
        await supabase
          .from('analises')
          .update({
            resultado: 'retirado_kanban',
            detalhes: { ...((existing.detalhes as any) || {}), atualizado_manualmente: true },
          })
          .eq('id', existing.id)
      } else {
        await supabase.from('analises').insert({
          candidato_id: candidateId,
          vaga_id: targetVagaId,
          resultado: 'retirado_kanban',
          user_id: user.id,
        })
      }
    } else {
      // Se não possui vaga_id vinculada, atualiza a análise mais recente ou cria uma geral
      const { data: latestAnalise } = await supabase
        .from('analises')
        .select('id, detalhes')
        .eq('candidato_id', candidateId)
        .order('criado_em', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestAnalise) {
        await supabase
          .from('analises')
          .update({
            resultado: 'retirado_kanban',
            detalhes: { ...((latestAnalise.detalhes as any) || {}), atualizado_manualmente: true },
          })
          .eq('id', latestAnalise.id)
      } else {
        await supabase.from('analises').insert({
          candidato_id: candidateId,
          vaga_id: null,
          resultado: 'retirado_kanban',
          user_id: user.id,
        })
      }
    }
  }
}

export async function deleteCandidate(candidateId: string) {
  // Mantido para compatibilidade, mas a ação do Kanban agora utiliza removeFromKanban
  const { error } = await supabase.from('candidatos').delete().eq('id', candidateId)
  if (error) throw error
}

export async function createStage(name: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Não autenticado')

  const { data: stages } = await supabase
    .from('etapas')
    .select('ordem')
    .order('ordem', { ascending: false })
    .limit(1)

  const order = stages && stages.length > 0 ? stages[0].ordem + 1 : 1

  const { data, error } = await supabase
    .from('etapas')
    .insert({
      nome: name,
      user_id: session.user.id,
      ordem: order,
      cor: 'bg-slate-200',
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function reorderStages(orderedStageIds: string[]) {
  // Update each stage's order in parallel
  const updates = orderedStageIds.map((id, index) =>
    supabase.from('etapas').update({ ordem: index }).eq('id', id),
  )

  const results = await Promise.all(updates)
  const errorResult = results.find((r) => r.error)
  if (errorResult?.error) {
    throw errorResult.error
  }
}

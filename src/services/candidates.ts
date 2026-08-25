import { supabase } from '@/lib/supabase/client'

type CandidatesListItem = {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  curriculo_url: string | null
  fonte: string | null
  criado_em: string
  duplicado_de: string | null
  vaga_id: string | null
  etapa_id: string | null
  vagas: { titulo: string } | { titulo: string }[] | null
  etapas: { nome: string; cor: string | null } | { nome: string; cor: string | null }[] | null
  analises: { id: string; resultado: string | null; criado_em: string; detalhes: any }[] | null
}

export async function getCandidatesList() {
  const { data, error } = await supabase
    .from('candidatos')
    .select(`
      id,
      nome,
      email,
      telefone,
      curriculo_url,
      fonte,
      criado_em,
      duplicado_de,
      vaga_id,
      etapa_id,
      vagas (titulo),
      etapas (nome, cor),
      analises (id, resultado, criado_em, detalhes)
    `)
    .order('criado_em', { ascending: false })

  if (error) throw error

  return (data as unknown as CandidatesListItem[]).map((c) => {
    const sortedAnalises = c.analises
      ? [...c.analises].sort(
          (a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime(),
        )
      : []

    const latestIa = sortedAnalises[0]
    const resolvedStatus = latestIa ? latestIa.resultado : 'pendente'

    return {
      id: c.id,
      nome: c.nome,
      email: c.email || '',
      telefone: c.telefone || '',
      curriculo_url: c.curriculo_url,
      fonte: c.fonte || 'Site',
      criado_em: c.criado_em,
      vaga_id: c.vaga_id,
      etapa_id: c.etapa_id,
      vaga: c.vagas ? (Array.isArray(c.vagas) ? c.vagas[0]?.titulo : c.vagas.titulo) : 'Sem vaga',
      etapa: c.etapas ? (Array.isArray(c.etapas) ? c.etapas[0]?.nome : c.etapas.nome) : 'Sem etapa',
      etapa_cor: c.etapas
        ? Array.isArray(c.etapas)
          ? c.etapas[0]?.cor
          : c.etapas.cor
        : 'bg-slate-200',
      status_analise: resolvedStatus,
      duplicado_de: c.duplicado_de,
    }
  })
}

export async function updateAnaliseStatus(
  cv_id: string,
  vaga_id: string | null,
  status: string,
  user_id: string,
) {
  if (!vaga_id) throw new Error('Candidato não possui vaga associada')

  const { data: existing, error: searchError } = await supabase
    .from('analises')
    .select('id, detalhes')
    .eq('candidato_id', cv_id)
    .eq('vaga_id', vaga_id)
    .maybeSingle()

  if (searchError) throw searchError

  if (existing) {
    const { error } = await supabase
      .from('analises')
      .update({
        resultado: status,
        detalhes: { ...((existing.detalhes as any) || {}), atualizado_manualmente: true },
      })
      .eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('analises').insert({
      candidato_id: cv_id,
      vaga_id: vaga_id,
      resultado: status,
      user_id: user_id,
    })
    if (error) throw error
  }
}

export async function deleteCandidate(id: string) {
  const { error } = await supabase.from('candidatos').delete().eq('id', id)
  if (error) throw error
}

export async function updateCandidate(
  id: string,
  candidateData: { nome: string; email: string; telefone: string },
) {
  const { error } = await supabase.from('candidatos').update(candidateData).eq('id', id)
  if (error) throw error
}

export async function updateCandidateVaga(id: string, vagaId: string) {
  const { error } = await supabase.from('candidatos').update({ vaga_id: vagaId }).eq('id', id)
  if (error) throw error
}

export async function reanalyzeCandidate(cv_id: string, vaga_id: string, user_id: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const headers: Record<string, string> = {}
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }

  const { data, error } = await supabase.functions.invoke('analisar-cv-criterios', {
    body: { cv_id, vaga_id, user_id },
    headers,
  })
  if (error) {
    throw new Error(
      error.message || 'Erro de comunicação com o servidor de análise. Tente novamente.',
    )
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export async function bulkDeleteCandidates(ids: string[]) {
  const { error } = await supabase.from('candidatos').delete().in('id', ids)
  if (error) throw error
}

export async function reanalyzeCandidateEdge(candidateId: string) {
  const { data, error } = await supabase.functions.invoke('reanalisar-candidato', {
    body: { candidate_id: candidateId },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export async function identifyVagaForCandidate(candidatoId: string, userId: string) {
  const { data, error } = await supabase.functions.invoke('identify-vaga-from-cv', {
    body: { candidato_id: candidatoId, user_id: userId },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as { vaga_id: string | null; confianca: string; justificativa: string }
}

export interface RecoverCandidatesResumo {
  total_candidatos?: number
  total_pdfs_encontrados: number
  inseridos?: number
  sucesso: number
  pulados?: number
  pulados_existentes: number
  pulados_duplicados?: number
  falhas: number
  detalhes_falhas?: Array<{
    arquivo?: string
    erro?: string
    path?: string
    motivo?: string
    [key: string]: any
  }>
  detalhes?: Array<{
    arquivo: string
    status: 'inserido' | 'pulado' | 'falha'
    nome?: string | null
    email?: string | null
    telefone?: string | null
    vaga_id?: string | null
    erro?: string
    motivo?: string
    [key: string]: any
  }>
  tempo_total_segundos?: number
}

export interface RecoverCandidatesResponse {
  success: boolean
  resumo?: RecoverCandidatesResumo
  error?: string
  message?: string
}

export async function recoverCandidatesFromStorage(): Promise<RecoverCandidatesResponse> {
  const { data, error } = await supabase.functions.invoke('recover-candidates', {
    body: {},
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as RecoverCandidatesResponse
}

export interface FixRecoveredCandidatesDetail {
  id: string
  nome: string
  status: string
  erro?: string
}

export interface FixRecoveredCandidatesResponse {
  success: boolean
  total?: number
  sucessos?: number
  falhas?: number
  detalhes?: FixRecoveredCandidatesDetail[]
  error?: string
}

export async function fixRecoveredCandidates(): Promise<FixRecoveredCandidatesResponse> {
  const { data, error } = await supabase.functions.invoke('fix-recovered-candidates', {
    body: {},
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as FixRecoveredCandidatesResponse
}

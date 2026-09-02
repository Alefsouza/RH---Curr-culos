import { supabase } from '@/lib/supabase/client'

export type CandidateItem = {
  id: string
  nome: string
  email: string
  telefone: string
  curriculo_url: string | null
  fonte: string
  criado_em: string
  vaga_id: string | null
  etapa_id: string | null
  vaga: string
  etapa: string
  etapa_cor: string
  status_analise: string
  duplicado_de: string | null
}

export interface GetCandidatesListParams {
  page?: number
  pageSize?: number
  search?: string
  statusFilter?: string
  startDate?: string
  endDate?: string
  dateSortOrder?: 'desc' | 'asc' | null
}

export interface GetCandidatesListResult {
  data: CandidateItem[]
  total: number
}

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
  analises:
    | {
        id: string
        vaga_id: string | null
        resultado: string | null
        criado_em: string
        detalhes: any
      }[]
    | null
}

export function resolveCandidateStatus(
  analises:
    | { vaga_id?: string | null; resultado: string | null; criado_em: string }[]
    | null
    | undefined,
  vagaId: string | null | undefined,
): string {
  if (!analises || analises.length === 0) return 'pendente'

  const sortedAnalises = [...analises].sort(
    (a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime(),
  )

  // 1. Se existir análise cujo vaga_id = candidatos.vaga_id, use o resultado dessa análise (a mais recente dessa vaga)
  if (vagaId) {
    const analiseVagaAtual = sortedAnalises.find((a) => a.vaga_id === vagaId)
    if (analiseVagaAtual && analiseVagaAtual.resultado) {
      return analiseVagaAtual.resultado
    }
  }

  // 2. Somente quando NÃO existir análise para a vaga atual, faça fallback para a análise mais recente do candidato
  const latestAnalise = sortedAnalises[0]
  return latestAnalise?.resultado || 'pendente'
}

export async function getCandidatesList(
  params: GetCandidatesListParams = {},
): Promise<GetCandidatesListResult> {
  const {
    page = 1,
    pageSize = 30,
    search = '',
    statusFilter = 'todos',
    startDate,
    endDate,
    dateSortOrder = 'desc',
  } = params

  const isStatusFilterActive = statusFilter && statusFilter !== 'todos'
  const trimmedSearch = search.trim()

  // Se o filtro de status da análise IA estiver ativo, precisamos consultar ou filtrar com base no status resolvido
  // Para filtros padrão (busca textual por nome/email, datas, ordenação), aplicamos server-side diretamente com count exact e range
  let query = supabase.from('candidatos').select(
    `
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
      analises (id, vaga_id, resultado, criado_em, detalhes)
    `,
    { count: 'exact' },
  )

  if (trimmedSearch) {
    // Busca textual por nome ou email via ilike
    const escaped = trimmedSearch.replace(/[%_]/g, '\\$&')
    query = query.or(`nome.ilike.%${escaped}%,email.ilike.%${escaped}%`)
  }

  if (statusFilter === 'sem_etapa') {
    query = query.is('etapa_id', null)
  }

  if (startDate) {
    // Formata início do dia em UTC/ISO
    const startIso = new Date(`${startDate}T00:00:00.000`).toISOString()
    query = query.gte('criado_em', startIso)
  }

  if (endDate) {
    // Formata fim do dia em UTC/ISO
    const endIso = new Date(`${endDate}T23:59:59.999`).toISOString()
    query = query.lte('criado_em', endIso)
  }

  const ascending = dateSortOrder === 'asc'
  query = query.order('criado_em', { ascending })

  if (isStatusFilterActive && statusFilter !== 'sem_etapa') {
    // Quando filtrando por status_analise (qualificado / nao_qualificado / revisar),
    // buscamos os registros correspondentes aos filtros anteriores e paginamos após resolver a análise mais recente
    const { data, error } = await query
    if (error) throw error

    const mapped = ((data || []) as unknown as CandidatesListItem[]).map((c) => {
      const resolvedStatus = resolveCandidateStatus(c.analises, c.vaga_id)

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
        etapa: c.etapas
          ? Array.isArray(c.etapas)
            ? c.etapas[0]?.nome
            : c.etapas.nome
          : 'Sem etapa',
        etapa_cor: c.etapas
          ? Array.isArray(c.etapas)
            ? c.etapas[0]?.cor
            : c.etapas.cor
          : 'bg-slate-200',
        status_analise: resolvedStatus,
        duplicado_de: c.duplicado_de,
      }
    })

    const filtered = mapped.filter((c) => c.status_analise === statusFilter)
    const total = filtered.length
    const from = (page - 1) * pageSize
    const to = from + pageSize
    const paginatedData = filtered.slice(from, to)

    return {
      data: paginatedData,
      total,
    }
  }

  // Paginação padrão server-side
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  query = query.range(from, to)

  const { data, count, error } = await query

  if (error) throw error

  const mappedData: CandidateItem[] = ((data || []) as unknown as CandidatesListItem[]).map((c) => {
    const resolvedStatus = resolveCandidateStatus(c.analises, c.vaga_id)

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

  return {
    data: mappedData,
    total: count ?? 0,
  }
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

export async function updateCandidateNome(id: string, nome: string) {
  const { error } = await supabase.from('candidatos').update({ nome }).eq('id', id)
  if (error) throw error
}

export async function updateCandidateVaga(id: string, vagaId: string | null) {
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

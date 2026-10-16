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
  ativo_kanban?: boolean | null
  motivo_inativo?: string | null
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
  ativo_kanban?: boolean | null
  motivo_inativo?: string | null
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
  motivoInativo?: string | null,
): string {
  if (motivoInativo === 'Arquivado') return 'arquivado'

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
  let query = supabase
    .from('candidatos')
    .select(
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
      ativo_kanban,
      motivo_inativo,
      vagas (titulo),
      etapas (nome, cor),
      analises (id, vaga_id, resultado, criado_em, detalhes)
    `,
      { count: 'exact' },
    )
    .is('duplicado_de', null)

  if (trimmedSearch) {
    // Busca textual por nome ou email via ilike
    const escaped = trimmedSearch.replace(/[%_]/g, '\\$&')
    query = query.or(`nome.ilike.%${escaped}%,email.ilike.%${escaped}%`)
  }

  if (statusFilter === 'sem_etapa') {
    query = query.is('etapa_id', null)
  } else if (statusFilter === 'arquivado') {
    query = query.eq('motivo_inativo', 'Arquivado')
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

  if (isStatusFilterActive && statusFilter !== 'sem_etapa' && statusFilter !== 'arquivado') {
    // Quando filtrando por status_analise (qualificado / nao_qualificado / revisar),
    // buscamos os registros correspondentes aos filtros anteriores e paginamos após resolver a análise mais recente
    const { data, error } = await query
    if (error) throw error

    const mapped = ((data || []) as unknown as CandidatesListItem[]).map((c) => {
      const resolvedStatus = resolveCandidateStatus(c.analises, c.vaga_id, c.motivo_inativo)

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
        ativo_kanban: c.ativo_kanban,
        motivo_inativo: c.motivo_inativo,
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
    const resolvedStatus = resolveCandidateStatus(c.analises, c.vaga_id, c.motivo_inativo)

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
      ativo_kanban: c.ativo_kanban,
      motivo_inativo: c.motivo_inativo,
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

  // Se o status for alterado para 'qualificado', reativar o candidato no Kanban (reversibilidade)
  // E se estiver sem etapa, mover automaticamente para "Triagem" e registrar no histórico
  if (status === 'qualificado') {
    const { data: candidatoAtual } = await supabase
      .from('candidatos')
      .select('etapa_id')
      .eq('id', cv_id)
      .maybeSingle()

    const updatePayload: { ativo_kanban: boolean; motivo_inativo: null; etapa_id?: string } = {
      ativo_kanban: true,
      motivo_inativo: null,
    }

    let assignedTriagemEtapaId: string | null = null

    if (!candidatoAtual?.etapa_id) {
      // Buscar a etapa "Triagem" ou a primeira etapa do funil (menor ordem)
      const { data: triagemEtapa } = await supabase
        .from('etapas')
        .select('id')
        .ilike('nome', 'Triagem')
        .limit(1)
        .maybeSingle()

      if (triagemEtapa?.id) {
        assignedTriagemEtapaId = triagemEtapa.id
      } else {
        const { data: firstEtapa } = await supabase
          .from('etapas')
          .select('id')
          .order('ordem', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (firstEtapa?.id) {
          assignedTriagemEtapaId = firstEtapa.id
        }
      }

      if (assignedTriagemEtapaId) {
        updatePayload.etapa_id = assignedTriagemEtapaId
      }
    }

    const { error: candUpdateError } = await supabase
      .from('candidatos')
      .update(updatePayload)
      .eq('id', cv_id)

    if (candUpdateError) throw candUpdateError

    // Se a etapa foi alterada para Triagem, registrar no histórico candidato_etapa
    if (assignedTriagemEtapaId) {
      try {
        await supabase.from('candidato_etapa').insert({
          candidato_id: cv_id,
          etapa_id: assignedTriagemEtapaId,
          usuario_id: user_id,
        })
      } catch (histError) {
        console.error('Erro ao registrar histórico de etapa Triagem:', histError)
      }
    }
  } else if (status === 'retirado_kanban' || status === 'nao_qualificado') {
    // Quando o candidato é retirado do Kanban ou marcado como Não Qualificado
    await supabase
      .from('candidatos')
      .update({
        ativo_kanban: false,
        motivo_inativo: status === 'retirado_kanban' ? 'Retirado Kanban' : 'Não Qualificado',
      })
      .eq('id', cv_id)
  }
}

export interface CandidateDeletionImpact {
  candidatoNome: string
  mensagensWhatsapp: number
  respostasWhatsapp: number
  conversasWhatsapp: number
  observacoes: number
  historicoEtapas: number
  analises: number
  vagaNome?: string | null
  etapaNome?: string | null
}

export async function getCandidateDeletionImpact(
  candidateId: string,
): Promise<CandidateDeletionImpact> {
  const [candRes, msgRes, respRes, convRes, obsRes, etapaHistRes, analisesRes] = await Promise.all([
    supabase
      .from('candidatos')
      .select('nome, vagas(titulo), etapas(nome)')
      .eq('id', candidateId)
      .maybeSingle(),
    supabase
      .from('mensagens_whatsapp')
      .select('*', { count: 'exact', head: true })
      .eq('candidato_id', candidateId),
    supabase
      .from('respostas_whatsapp')
      .select('*', { count: 'exact', head: true })
      .eq('candidato_id', candidateId),
    supabase
      .from('conversas_whatsapp')
      .select('*', { count: 'exact', head: true })
      .eq('candidato_id', candidateId),
    supabase
      .from('candidato_observacoes')
      .select('*', { count: 'exact', head: true })
      .eq('candidato_id', candidateId),
    supabase
      .from('candidato_etapa')
      .select('*', { count: 'exact', head: true })
      .eq('candidato_id', candidateId),
    supabase
      .from('analises')
      .select('*', { count: 'exact', head: true })
      .eq('candidato_id', candidateId),
  ])

  const candData: any = candRes.data
  const vagaNome = candData?.vagas
    ? Array.isArray(candData.vagas)
      ? candData.vagas[0]?.titulo
      : candData.vagas?.titulo
    : null
  const etapaNome = candData?.etapas
    ? Array.isArray(candData.etapas)
      ? candData.etapas[0]?.nome
      : candData.etapas?.nome
    : null

  return {
    candidatoNome: candData?.nome || 'Candidato',
    mensagensWhatsapp: msgRes.count || 0,
    respostasWhatsapp: respRes.count || 0,
    conversasWhatsapp: convRes.count || 0,
    observacoes: obsRes.count || 0,
    historicoEtapas: etapaHistRes.count || 0,
    analises: analisesRes.count || 0,
    vagaNome,
    etapaNome,
  }
}

export async function archiveCandidate(candidateId: string) {
  const { error } = await supabase
    .from('candidatos')
    .update({
      ativo_kanban: false,
      motivo_inativo: 'Arquivado',
    })
    .eq('id', candidateId)
  if (error) throw error
}

export async function unarchiveCandidate(candidateId: string) {
  const { error } = await supabase
    .from('candidatos')
    .update({
      ativo_kanban: true,
      motivo_inativo: null,
    })
    .eq('id', candidateId)
  if (error) throw error
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

export async function bulkArchiveCandidates(ids: string[]) {
  const { error } = await supabase
    .from('candidatos')
    .update({
      ativo_kanban: false,
      motivo_inativo: 'Arquivado',
    })
    .in('id', ids)
  if (error) throw error
}

export async function bulkDeleteCandidates(ids: string[]) {
  const { error } = await supabase.from('candidatos').delete().in('id', ids)
  if (error) throw error
}

function isFunctionsFetchOrTimeoutError(error: any): boolean {
  if (!error) return false
  const name = String(error.name || '')
  const msg = String(error.message || '').toLowerCase()
  return (
    name === 'FunctionsFetchError' ||
    name === 'FunctionsHttpError' ||
    name === 'FunctionsRelayError' ||
    msg.includes('failed to send a request') ||
    msg.includes('networkerror') ||
    msg.includes('fetch failed') ||
    msg.includes('timeout') ||
    msg.includes('abort')
  )
}

export async function reanalyzeCandidateEdge(candidateId: string) {
  const invoke = () =>
    supabase.functions.invoke('reanalisar-candidato', {
      body: { candidate_id: candidateId },
    })

  let { data, error } = await invoke()

  // Se der FunctionsFetchError ou timeout, tenta um retry único automático
  if (error && isFunctionsFetchOrTimeoutError(error)) {
    console.warn(
      `[reanalyzeCandidateEdge] Falha de comunicação/timeout ao reanalisar ${candidateId}. Tentando retry único...`,
      error,
    )
    const retryRes = await invoke()
    data = retryRes.data
    error = retryRes.error
  }

  if (error) {
    if (isFunctionsFetchOrTimeoutError(error)) {
      throw new Error(
        'Tempo limite esgotado ao reanalisar candidato. O servidor demorou mais que o esperado. Por favor, tente novamente.',
      )
    }
    throw new Error(error.message || 'Erro ao processar reanálise do candidato.')
  }

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

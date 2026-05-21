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

export async function reanalyzeCandidate(cv_id: string, vaga_id: string, user_id: string) {
  const { data, error } = await supabase.functions.invoke('analisar-cv-criterios', {
    body: { cv_id, vaga_id, user_id },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

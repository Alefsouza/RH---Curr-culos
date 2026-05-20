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
  vagas: { titulo: string } | { titulo: string }[] | null
  analises: { resultado: string | null; detalhes: any; criado_em: string }[] | null
}

export async function fetchCandidates() {
  const { data, error } = await supabase.from('candidatos').select(`
      *,
      vagas (titulo),
      analises (resultado, detalhes, criado_em)
    `)
  if (error) throw error

  return (data as unknown as CandidateWithRelations[])
    .filter((d) => {
      const sortedAnalises = d.analises
        ? [...d.analises].sort(
            (a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime(),
          )
        : []

      const latestIa = sortedAnalises[0]
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
        appliedAt: d.criado_em,
        analysisResult: latestIa?.resultado || null,
        analysisDetails: latestIa?.detalhes || null,
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

export async function deleteCandidate(candidateId: string) {
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
    .eq('user_id', session.user.id)
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

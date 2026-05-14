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
      vagas ( titulo ),
      analise_cv ( status, atualizado_em ),
      analises ( resultado, criado_em )
    `)
  if (error) throw error

  return data
    .filter((d: any) => {
      const sortedAnalises = d.analises
        ? [...d.analises].sort(
            (a: any, b: any) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime(),
          )
        : []
      const sortedAnaliseCv = d.analise_cv
        ? [...d.analise_cv].sort(
            (a: any, b: any) =>
              new Date(b.atualizado_em || 0).getTime() - new Date(a.atualizado_em || 0).getTime(),
          )
        : []

      const latestIa = sortedAnalises[0]
      const latestCv = sortedAnaliseCv[0]

      let isQualified = false

      if (latestCv && latestIa) {
        if (new Date(latestCv.atualizado_em).getTime() >= new Date(latestIa.criado_em).getTime()) {
          isQualified = latestCv.status === 'pre_aprovado'
        } else {
          isQualified = latestIa.resultado === 'qualificado'
        }
      } else if (latestIa) {
        isQualified = latestIa.resultado === 'qualificado'
      } else if (latestCv) {
        isQualified = latestCv.status === 'pre_aprovado'
      }

      return isQualified
    })
    .map((d: any) => ({
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
        .then(({ error }) => {
          if (error) console.error('Erro no Edge Function enviar-whatsapp:', error)
        })
        .catch(console.error)
    }
  } catch (e) {
    console.error('Erro ao invocar envio de WhatsApp:', e)
  }
}

export async function deleteCandidate(candidateId: string) {
  await supabase.from('analise_cv').delete().eq('cv_id', candidateId)
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

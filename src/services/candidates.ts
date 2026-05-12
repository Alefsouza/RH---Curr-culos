import { supabase } from '@/lib/supabase/client'

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
      vagas ( titulo ),
      etapas ( nome, cor ),
      analises ( resultado ),
      analise_cv ( id, status, vaga_id )
    `)
    .order('criado_em', { ascending: false })

  if (error) throw error

  return data.map((c: any) => ({
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
    status_analise: c.analises && c.analises.length > 0 ? c.analises[0].resultado : 'pendente',
    status_analise_cv: c.analise_cv && c.analise_cv.length > 0 ? c.analise_cv[0].status : null,
    duplicado_de: c.duplicado_de,
  }))
}

export async function updateAnaliseCvStatus(cv_id: string, vaga_id: string | null, status: string) {
  if (!vaga_id) throw new Error('Candidato não possui vaga associada')

  const { data: existing, error: searchError } = await supabase
    .from('analise_cv')
    .select('id')
    .eq('cv_id', cv_id)
    .eq('vaga_id', vaga_id)
    .maybeSingle()

  if (searchError) throw searchError

  if (existing) {
    const { error } = await supabase.from('analise_cv').update({ status }).eq('id', existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('analise_cv').insert({ cv_id, vaga_id, status })
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

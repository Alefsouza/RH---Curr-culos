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
      vagas ( titulo ),
      etapas ( nome, cor ),
      analises ( resultado )
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
    vaga: c.vagas ? (Array.isArray(c.vagas) ? c.vagas[0]?.titulo : c.vagas.titulo) : 'Sem vaga',
    etapa: c.etapas ? (Array.isArray(c.etapas) ? c.etapas[0]?.nome : c.etapas.nome) : 'Sem etapa',
    etapa_cor: c.etapas
      ? Array.isArray(c.etapas)
        ? c.etapas[0]?.cor
        : c.etapas.cor
      : 'bg-slate-200',
    status_analise: c.analises && c.analises.length > 0 ? c.analises[0].resultado : 'pendente',
    duplicado_de: c.duplicado_de,
  }))
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

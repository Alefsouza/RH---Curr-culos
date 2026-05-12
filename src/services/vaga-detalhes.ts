import { supabase } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'

export type Vaga = Database['public']['Tables']['vagas']['Row']
export type Candidato = Database['public']['Tables']['candidatos']['Row']
export type AnaliseCV = Database['public']['Tables']['analise_cv']['Row']

export interface AnaliseCVComCandidato extends AnaliseCV {
  candidato: Candidato | null
}

export const vagaDetalhesService = {
  async getVaga(id: string): Promise<Vaga> {
    const { data, error } = await supabase.from('vagas').select('*').eq('id', id).single()
    if (error) throw error
    return data
  },

  async getAnalises(vagaId: string): Promise<AnaliseCVComCandidato[]> {
    const { data, error } = await supabase
      .from('analise_cv')
      .select('*, candidato:candidatos(*)')
      .eq('vaga_id', vagaId)
      .order('criado_em', { ascending: false })

    if (error) throw error

    // In edge cases, Supabase might return an array for relationships if not strict one-to-one.
    // We map it to ensure exactly one object or null at runtime.
    return (data || []).map((row: any) => ({
      ...row,
      candidato: Array.isArray(row.candidato) ? row.candidato[0] : row.candidato,
    })) as AnaliseCVComCandidato[]
  },

  async updateStatus(analiseId: string, status: 'pre_aprovado' | 'reprovado'): Promise<void> {
    const { error } = await supabase.from('analise_cv').update({ status }).eq('id', analiseId)

    if (error) throw error
  },
}

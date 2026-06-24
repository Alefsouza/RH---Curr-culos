import { supabase } from '@/lib/supabase/client'
import { Database } from '@/lib/supabase/types'

export type Vaga = Database['public']['Tables']['vagas']['Row']
export type VagaInsert = Database['public']['Tables']['vagas']['Insert']
export type VagaUpdate = Database['public']['Tables']['vagas']['Update']

export interface VagaComEstatisticas extends Vaga {
  estatisticas: {
    total: number
    qualificados: number
    naoQualificados: number
    revisar: number
  }
}

export const vagasService = {
  async getVagasComEstatisticas(userId: string): Promise<VagaComEstatisticas[]> {
    const { data: userProfile } = await supabase
      .from('usuarios')
      .select('is_admin')
      .eq('id', userId)
      .single()

    const isAdmin = userProfile?.is_admin || false

    let vagasQuery = supabase.from('vagas').select('*').order('criado_em', { ascending: false })

    let analisesQuery = supabase.from('analises').select('vaga_id, resultado')

    if (!isAdmin) {
      vagasQuery = vagasQuery.eq('user_id', userId)
      analisesQuery = analisesQuery.eq('user_id', userId)
    }

    const { data: vagas, error: vagasError } = await vagasQuery
    if (vagasError) throw vagasError

    const { data: analises, error: analisesError } = await analisesQuery
    if (analisesError) throw analisesError

    return vagas.map((vaga) => {
      const analisesVaga = analises.filter((a) => a.vaga_id === vaga.id)
      return {
        ...vaga,
        estatisticas: {
          total: analisesVaga.length,
          qualificados: analisesVaga.filter((a) => a.resultado === 'qualificado').length,
          naoQualificados: analisesVaga.filter((a) => a.resultado === 'nao_qualificado').length,
          revisar: analisesVaga.filter((a) => a.resultado === 'revisar').length,
        },
      }
    })
  },

  async createVaga(vaga: VagaInsert) {
    const { data, error } = await supabase.from('vagas').insert(vaga).select().single()
    if (error) throw error
    return data
  },

  async updateVaga(id: string, vaga: VagaUpdate) {
    const { data, error } = await supabase.from('vagas').update(vaga).eq('id', id).select().single()
    if (error) throw error
    return data
  },

  async deleteVaga(id: string) {
    const { error } = await supabase.from('vagas').delete().eq('id', id)
    if (error) throw error
  },
}

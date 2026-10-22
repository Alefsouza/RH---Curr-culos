export interface Candidate {
  id: string
  name: string
  email: string
  phone: string
  source: string
  stageId: string
  job: string
  vagaId?: string | null
  appliedAt: string
  criado_em?: string
  curriculo_url?: string | null
  analysisResult?: string | null
  analysisDetails?: any
  ultima_resposta_whatsapp?: string | null
  proximidade?: 'cursino' | 'sapopemba' | 'nenhum' | null
  cargoPretendido?: string | null
  idade?: number | null
  dataNascimento?: string | null
}

export interface Stage {
  id: string
  name: string
  color: string
  order: number
}

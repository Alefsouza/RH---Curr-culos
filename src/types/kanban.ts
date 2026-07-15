export interface Candidate {
  id: string
  name: string
  email: string
  phone: string
  source: string
  stageId: string
  vaga_id: string | null
  job: string
  appliedAt: string
  analysisResult?: string | null
  analysisDetails?: any
  ultima_resposta_whatsapp?: string | null
}

export interface Stage {
  id: string
  name: string
  color: string
  order: number
}

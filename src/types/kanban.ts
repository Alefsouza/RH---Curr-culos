export type Source = 'Outlook' | 'Cato' | 'Site'

export interface Candidate {
  id: string
  name: string
  email: string
  phone: string
  source: Source
  stageId: string
  job: string
  appliedAt: string
}

export interface Stage {
  id: string
  name: string
  color: string
  order: number
}

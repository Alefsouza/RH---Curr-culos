export interface Candidate {
  id: string
  name: string
  email: string
  phone: string
  source: string
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

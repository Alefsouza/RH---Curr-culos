import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, CheckCircle, Activity, Target } from 'lucide-react'
import { resolveCandidateStatus } from '@/services/candidates'

export function MetricsCards({ candidatos, analises }: { candidatos: any[]; analises: any[] }) {
  const total = candidatos.length

  const qualificados = candidatos.filter((c) => {
    const candidateAnalises = analises.filter((a) => a.candidato_id === c.id)
    return resolveCandidateStatus(candidateAnalises, c.vaga_id) === 'qualificado'
  }).length

  const taxaConversao = total > 0 ? Math.round((qualificados / total) * 100) : 0

  const naoQualificados = candidatos.filter((c) => {
    const candidateAnalises = analises.filter((a) => a.candidato_id === c.id)
    return resolveCandidateStatus(candidateAnalises, c.vaga_id) === 'nao_qualificado'
  }).length

  const taxaRotatividade = total > 0 ? Math.round((naoQualificados / total) * 100) : 0

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium text-slate-700">Total de Candidatos</CardTitle>
          <Users className="h-4 w-4 text-slate-400" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-slate-900">{total}</div>
          <p className="text-xs text-slate-500 mt-1">No período selecionado</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium text-slate-700">Aprovados</CardTitle>
          <CheckCircle className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-slate-900">{qualificados}</div>
          <p className="text-xs text-slate-500 mt-1">Candidatos qualificados</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium text-slate-700">Taxa de Conversão</CardTitle>
          <Target className="h-4 w-4 text-blue-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-slate-900">{taxaConversao}%</div>
          <p className="text-xs text-slate-500 mt-1">Aprovações / Total</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium text-slate-700">Rotatividade (Churn)</CardTitle>
          <Activity className="h-4 w-4 text-red-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-slate-900">{taxaRotatividade}%</div>
          <p className="text-xs text-slate-500 mt-1">Candidatos não qualificados</p>
        </CardContent>
      </Card>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { getPendingReviews, fetchVagas, fetchEtapas, updateReview } from '@/services/review'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import {
  ClipboardCheck,
  Inbox,
  CheckCircle,
  XCircle,
  Bot,
  UserCheck,
  Briefcase,
  GraduationCap,
  Code,
} from 'lucide-react'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'

function formatExperiencia(exp: any): string {
  if (typeof exp === 'string') return exp
  if (exp && typeof exp === 'object') {
    const cargo = exp.cargo || exp.titulo || exp.funcao || ''
    const empresa = exp.empresa || exp.empresa_nome || exp.companhia || ''
    const periodo = exp.periodo || exp.data || exp.periodo_trabalho || ''
    const parts = [cargo, empresa, periodo].filter(Boolean)
    return parts.length > 0 ? parts.join(' — ') : JSON.stringify(exp)
  }
  return String(exp ?? '')
}

function formatFormacao(form: any): string {
  if (typeof form === 'string') return form
  if (form && typeof form === 'object') {
    if (form.nivel && form.status) {
      const nivel = String(form.nivel)
      const status = String(form.status).toLowerCase().trim()
      if (status === 'concluído' || status === 'concluido') {
        return `${nivel} Completo`
      }
      if (status === 'incompleto') {
        return `${nivel} Incompleto`
      }
      if (status === 'cursando') {
        return `Cursando ${nivel}`
      }
      return `${nivel} — ${status}`
    }
    const curso = form.curso || form.titulo || form.graduacao || ''
    const instituicao = form.instituicao || form.universidade || form.escola || ''
    const periodo = form.periodo || form.ano || form.data || ''
    const parts = [curso, instituicao, periodo].filter(Boolean)
    return parts.length > 0 ? parts.join(' — ') : 'Não informado'
  }
  return 'Não informado'
}

function normalizeFormacoes(dados: any): any[] {
  if (!dados || typeof dados !== 'object') return []
  const raw = dados.formacao_academica
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object') return [raw]
  if (typeof raw === 'string' && raw.trim()) return [raw]
  return []
}
function ReviewDetail({ analise, etapas, onConfirm, onCancel, isSubmitting }: any) {
  const [decision, setDecision] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [stageId, setStageId] = useState<string>('none')

  const candidato = analise.candidatos
  const dados = typeof candidato?.dados_extraidos === 'object' ? candidato.dados_extraidos : {}
  const detalhes = typeof analise.detalhes === 'object' ? analise.detalhes : {}

  const handleConfirm = () => {
    onConfirm(decision, notes, stageId === 'none' ? null : stageId)
  }

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold tracking-tight">Revisando: {candidato?.nome}</h2>
        <Button variant="outline" onClick={onCancel}>
          Voltar para lista
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-card p-6 rounded-xl border border-border shadow-sm flex flex-col gap-6 overflow-y-auto max-h-[calc(100vh-200px)]">
          <div>
            <h3 className="text-lg font-semibold mb-4">Dados do Currículo</h3>
            <div className="grid grid-cols-2 gap-4 text-sm mb-6">
              <div>
                <span className="text-muted-foreground">Email:</span>{' '}
                <p className="font-medium">{candidato?.email || '-'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Telefone:</span>{' '}
                <p className="font-medium">{candidato?.telefone || '-'}</p>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Vaga:</span>{' '}
                <p className="font-medium">{analise.vagas?.titulo || '-'}</p>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-medium flex items-center gap-2 mb-3">
              <Briefcase className="h-4 w-4" /> Experiência
            </h4>
            <ul className="list-disc pl-5 text-sm space-y-2 text-muted-foreground">
              {Array.isArray(dados.experiencia_profissional) &&
              dados.experiencia_profissional.length > 0 ? (
                dados.experiencia_profissional.map((exp: any, i: number) => (
                  <li key={i}>{formatExperiencia(exp)}</li>
                ))
              ) : (
                <li>Não informada</li>
              )}
            </ul>
          </div>

          <div>
            <h4 className="font-medium flex items-center gap-2 mb-3">
              <GraduationCap className="h-4 w-4" /> Formação
            </h4>
            <ul className="list-disc pl-5 text-sm space-y-2 text-muted-foreground">
              {(() => {
                const formacoes = normalizeFormacoes(dados)
                return formacoes.length > 0
                  ? formacoes.map((form: any, i: number) => <li key={i}>{formatFormacao(form)}</li>)
                  : [<li key="empty">Não informada</li>]
              })()}
            </ul>
          </div>

          <div>
            <h4 className="font-medium flex items-center gap-2 mb-3">
              <Code className="h-4 w-4" /> Skills
            </h4>
            <div className="flex flex-wrap gap-2">
              {Array.isArray(dados.skills) && dados.skills.length > 0 ? (
                dados.skills.map((skill: string, i: number) => (
                  <Badge key={i} variant="secondary">
                    {skill}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">Não informadas</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6 overflow-y-auto max-h-[calc(100vh-200px)]">
          <div className="bg-primary/5 p-6 rounded-xl border border-primary/20 shadow-sm">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-primary">
              <Bot className="h-5 w-5" /> Análise da IA
            </h3>
            <div className="space-y-4 text-sm">
              <div>
                <span className="font-medium text-foreground">Aderência: </span>
                <span className="text-muted-foreground">{detalhes.aderencia || 'N/A'}</span>
              </div>
              <div>
                <span className="font-medium text-foreground">Pontos Fortes:</span>
                <ul className="list-disc pl-5 mt-1 text-muted-foreground">
                  {Array.isArray(detalhes.pontos_fortes) ? (
                    detalhes.pontos_fortes.map((p: string, i: number) => <li key={i}>{p}</li>)
                  ) : (
                    <li>Nenhum detalhado</li>
                  )}
                </ul>
              </div>
              <div>
                <span className="font-medium text-foreground">Pontos Fracos:</span>
                <ul className="list-disc pl-5 mt-1 text-muted-foreground">
                  {Array.isArray(detalhes.pontos_fracos) ? (
                    detalhes.pontos_fracos.map((p: string, i: number) => <li key={i}>{p}</li>)
                  ) : (
                    <li>Nenhum detalhado</li>
                  )}
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-card p-6 rounded-xl border border-border shadow-sm flex flex-col gap-5">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" /> Veredito do RH
            </h3>

            <div className="space-y-3">
              <Label>Nova Classificação</Label>
              <div className="flex gap-3">
                <Button
                  variant={decision === 'qualificado' ? 'default' : 'outline'}
                  className={
                    decision === 'qualificado' ? 'bg-green-600 hover:bg-green-700 text-white' : ''
                  }
                  onClick={() => setDecision('qualificado')}
                >
                  <CheckCircle className="h-4 w-4 mr-2" /> Qualificado
                </Button>
                <Button
                  variant={decision === 'nao_qualificado' ? 'default' : 'outline'}
                  className={
                    decision === 'nao_qualificado' ? 'bg-red-600 hover:bg-red-700 text-white' : ''
                  }
                  onClick={() => setDecision('nao_qualificado')}
                >
                  <XCircle className="h-4 w-4 mr-2" /> Não Qualificado
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Mover para Etapa</Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma etapa..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não mover da etapa atual</SelectItem>
                  {etapas.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Notas / Comentários</Label>
              <Textarea
                placeholder="Adicione observações sobre a decisão para o histórico..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[100px]"
              />
            </div>

            <Button
              className="w-full mt-2"
              onClick={handleConfirm}
              disabled={!decision || isSubmitting}
            >
              {isSubmitting ? 'Salvando...' : 'Confirmar Revisão'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ReviewPage() {
  const { user } = useAuth()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [reviews, setReviews] = useState<any[]>([])
  const [vagas, setVagas] = useState<any[]>([])
  const [etapas, setEtapas] = useState<any[]>([])
  const [selectedReview, setSelectedReview] = useState<any | null>(null)

  const [vagaFilter, setVagaFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('')

  const loadData = async () => {
    setLoading(true)
    try {
      const [revs, vgs, etps] = await Promise.all([
        getPendingReviews({
          vaga_id: vagaFilter,
          startDate: dateFilter || undefined,
          endDate: dateFilter || undefined,
        }),
        fetchVagas(),
        fetchEtapas(),
      ])
      setReviews(revs)
      setVagas(vgs)
      setEtapas(etps)
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [vagaFilter, dateFilter])

  const handleConfirm = async (decision: string, notes: string, stageId: string | null) => {
    if (!selectedReview) return
    setIsSubmitting(true)
    try {
      await updateReview(
        selectedReview.id,
        selectedReview.candidato_id,
        decision,
        notes,
        stageId,
        user,
      )
      toast({ title: 'Sucesso', description: 'Revisão concluída com sucesso!' })
      setSelectedReview(null)
      loadData()
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (selectedReview) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto">
        <ReviewDetail
          analise={selectedReview}
          etapas={etapas}
          onConfirm={handleConfirm}
          onCancel={() => setSelectedReview(null)}
          isSubmitting={isSubmitting}
        />
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto animate-fade-in flex flex-col gap-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <ClipboardCheck className="h-8 w-8 text-primary" />
            Revisão de IA
          </h1>
          <p className="text-muted-foreground mt-1">
            Valide as análises automáticas que requerem atenção humana.
          </p>
        </div>
        <Badge variant="secondary" className="text-sm px-3 py-1">
          {reviews.length} aguardando revisão
        </Badge>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center bg-card p-4 rounded-xl border border-border shadow-sm">
        <div className="w-full md:w-64">
          <Select value={vagaFilter} onValueChange={setVagaFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filtrar por vaga" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as vagas</SelectItem>
              {vagas.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.titulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:w-64">
          <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
        </div>
        {(vagaFilter !== 'all' || dateFilter) && (
          <Button
            variant="ghost"
            onClick={() => {
              setVagaFilter('all')
              setDateFilter('')
            }}
          >
            Limpar Filtros
          </Button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-card rounded-xl border border-border border-dashed">
          <Inbox className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-xl font-semibold text-foreground mb-2">
            Nenhum currículo aguardando revisão
          </h3>
          <p className="text-muted-foreground max-w-md">
            Todas as análises da IA foram confirmadas ou não há novos currículos na fila.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reviews.map((rev) => (
            <div
              key={rev.id}
              className="bg-card rounded-xl border border-border shadow-sm hover:border-primary/50 transition-colors cursor-pointer group"
              onClick={() => setSelectedReview(rev)}
            >
              <div className="p-5 flex flex-col h-full justify-between gap-4">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-semibold text-lg line-clamp-1">
                      {rev.candidatos?.nome || 'Sem Nome'}
                    </h4>
                    <Badge
                      variant="outline"
                      className="bg-yellow-50 text-yellow-700 border-yellow-200"
                    >
                      Pendente
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-1 mb-1">
                    Vaga:{' '}
                    <span className="font-medium text-foreground">
                      {rev.vagas?.titulo || 'Não informada'}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Analisado em {format(new Date(rev.criado_em), 'dd/MM/yyyy HH:mm')}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                >
                  Revisar Análise
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

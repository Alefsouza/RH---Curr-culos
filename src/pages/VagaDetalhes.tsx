import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { vagaDetalhesService, Vaga, AnaliseCVComCandidato } from '@/services/vaga-detalhes'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase/client'
import {
  AlertCircle,
  RefreshCw,
  ArrowLeft,
  FileText,
  Briefcase,
  Code,
  User,
  FileX2,
  Filter,
  Mail,
  Phone,
} from 'lucide-react'

// Simple internal Badge to avoid dependency missing errors
const Badge = ({ children, className = '', variant = 'default' }: any) => {
  const base =
    'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors'
  const variants = {
    default: 'border-transparent bg-slate-900 text-slate-50',
    secondary: 'border-transparent bg-slate-100 text-slate-900',
    outline: 'text-slate-950 border-slate-200',
    success: 'border-transparent bg-green-100 text-green-800',
    destructive: 'border-transparent bg-red-100 text-red-800',
  }
  return (
    <div
      className={`${base} ${variants[variant as keyof typeof variants] || variants.default} ${className}`}
    >
      {children}
    </div>
  )
}

function MobileCVCard({
  analise,
  index,
  onToggleStatus,
}: {
  analise: AnaliseCVComCandidato
  index: number
  onToggleStatus: (a: AnaliseCVComCandidato) => void
}) {
  const candidato = analise.candidato
  if (!candidato) return null

  const dadosExtraidos = candidato.dados_extraidos as any
  const experiencia = Array.isArray(dadosExtraidos?.experiencia_profissional)
    ? dadosExtraidos.experiencia_profissional
    : []
  const skills = Array.isArray(dadosExtraidos?.skills) ? dadosExtraidos.skills : []
  const isAprovado = analise.status === 'pre_aprovado'

  return (
    <div
      className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm animate-fade-in-up transition-all hover:shadow-md flex flex-col gap-4"
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}
    >
      <div>
        <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <User className="h-5 w-5 text-slate-400" />
          {candidato.nome}
        </h3>
        <div className="text-sm text-slate-500 mt-2 space-y-1">
          {candidato.email && (
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4" /> {candidato.email}
            </div>
          )}
          {candidato.telefone && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4" /> {candidato.telefone}
            </div>
          )}
        </div>
      </div>

      <div className="bg-slate-50 p-3 rounded-lg flex items-center justify-between border border-slate-100">
        <Label
          className="text-sm font-medium text-slate-700 cursor-pointer"
          onClick={() => onToggleStatus(analise)}
        >
          Status da Análise
        </Label>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-semibold ${isAprovado ? 'text-green-600' : 'text-slate-500'}`}
          >
            {isAprovado ? 'Qualificado' : 'Não Qualificado'}
          </span>
          <Switch checked={isAprovado} onCheckedChange={() => onToggleStatus(analise)} />
        </div>
      </div>

      <div className="space-y-3">
        {experiencia.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 mb-1">
              <Briefcase className="h-4 w-4 text-slate-400" /> Experiência
            </h4>
            <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside pl-1">
              {experiencia.slice(0, 2).map((exp, i) => (
                <li key={i} className="line-clamp-2">
                  {exp}
                </li>
              ))}
            </ul>
          </div>
        )}

        {skills.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 mb-1.5">
              <Code className="h-4 w-4 text-slate-400" /> Skills
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {skills.slice(0, 5).map((skill, i) => (
                <Badge key={i} variant="secondary" className="font-normal text-xs">
                  {skill}
                </Badge>
              ))}
              {skills.length > 5 && (
                <Badge variant="outline" className="font-normal text-xs text-slate-400">
                  +{skills.length - 5}
                </Badge>
              )}
            </div>
          </div>
        )}
      </div>

      <Button
        variant="outline"
        onClick={() => window.open(candidato.curriculo_url || '#', '_blank')}
        disabled={!candidato.curriculo_url}
        className="w-full mt-2"
      >
        <FileText className="h-4 w-4 mr-2" />
        Ver Currículo
      </Button>
    </div>
  )
}

function DesktopCVTable({
  analises,
  onToggleStatus,
}: {
  analises: AnaliseCVComCandidato[]
  onToggleStatus: (a: AnaliseCVComCandidato) => void
}) {
  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden animate-fade-in-up">
      <Table>
        <TableHeader className="bg-slate-50">
          <TableRow>
            <TableHead className="w-[250px]">Candidato</TableHead>
            <TableHead className="min-w-[200px]">Experiência</TableHead>
            <TableHead className="w-[250px]">Skills</TableHead>
            <TableHead className="w-[180px]">Status</TableHead>
            <TableHead className="text-right w-[140px]">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {analises.map((analise) => {
            const candidato = analise.candidato
            if (!candidato) return null

            const dadosExtraidos = candidato.dados_extraidos as any
            const experiencia = Array.isArray(dadosExtraidos?.experiencia_profissional)
              ? dadosExtraidos.experiencia_profissional
              : []
            const skills = Array.isArray(dadosExtraidos?.skills) ? dadosExtraidos.skills : []
            const isAprovado = analise.status === 'pre_aprovado'

            return (
              <TableRow key={analise.id} className="hover:bg-slate-50/50">
                <TableCell>
                  <div className="font-medium text-slate-900">{candidato.nome}</div>
                  <div className="text-xs text-slate-500 mt-1 space-y-0.5">
                    {candidato.email && <div>{candidato.email}</div>}
                    {candidato.telefone && <div>{candidato.telefone}</div>}
                  </div>
                </TableCell>
                <TableCell>
                  {experiencia.length > 0 ? (
                    <ul className="text-sm text-slate-600 list-disc list-inside">
                      {experiencia.slice(0, 2).map((exp, i) => (
                        <li key={i} className="line-clamp-1">
                          {exp}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-sm text-slate-400">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {skills.slice(0, 4).map((skill, i) => (
                      <Badge key={i} variant="secondary" className="font-normal text-[10px]">
                        {skill}
                      </Badge>
                    ))}
                    {skills.length > 4 && (
                      <Badge variant="outline" className="font-normal text-[10px] text-slate-400">
                        +{skills.length - 4}
                      </Badge>
                    )}
                    {skills.length === 0 && <span className="text-sm text-slate-400">-</span>}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Switch checked={isAprovado} onCheckedChange={() => onToggleStatus(analise)} />
                    <Badge variant={isAprovado ? 'success' : 'secondary'}>
                      {isAprovado ? 'Qualificado' : 'Não Qualificado'}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(candidato.curriculo_url || '#', '_blank')}
                    disabled={!candidato.curriculo_url}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    CV
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

export default function VagaDetalhes() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [vaga, setVaga] = useState<Vaga | null>(null)
  const [analises, setAnalises] = useState<AnaliseCVComCandidato[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'todos' | 'qualificados' | 'nao_qualificados'>('todos')

  const fetchData = useCallback(
    async (silent = false) => {
      if (!id) return
      try {
        if (!silent) setLoading(true)
        setError(null)
        const [vagaData, analisesData] = await Promise.all([
          vagaDetalhesService.getVaga(id),
          vagaDetalhesService.getAnalises(id),
        ])
        setVaga(vagaData)
        setAnalises(analisesData)
      } catch (err: any) {
        if (!silent) setError('Não foi possível carregar os detalhes da vaga. ' + err.message)
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [id],
  )

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleToggleStatus = async (analise: AnaliseCVComCandidato) => {
    const novoStatus = analise.status === 'pre_aprovado' ? 'reprovado' : 'pre_aprovado'

    // Optimistic update
    setAnalises((prev) => prev.map((a) => (a.id === analise.id ? { ...a, status: novoStatus } : a)))

    try {
      // 4. Update status in db
      await vagaDetalhesService.updateStatus(analise.id, novoStatus)

      const candidateId = analise.candidato?.id || analise.cv_id
      if (candidateId) {
        if (novoStatus === 'pre_aprovado') {
          const {
            data: { user },
          } = await supabase.auth.getUser()
          if (user) {
            // 5. Adicione o CV ao Kanban como "Novo"
            let { data: etapa } = await supabase
              .from('etapas')
              .select('id')
              .eq('user_id', user.id)
              .ilike('nome', 'Novo')
              .maybeSingle()

            if (!etapa) {
              const { data: newEtapa } = await supabase
                .from('etapas')
                .insert({
                  nome: 'Novo',
                  ordem: 0,
                  cor: 'bg-blue-100',
                  user_id: user.id,
                })
                .select('id')
                .single()
              etapa = newEtapa
            }

            if (etapa) {
              await supabase.from('candidatos').update({ etapa_id: etapa.id }).eq('id', candidateId)
            }
          }
        } else {
          // 6. Remova o CV do Kanban
          await supabase.from('candidatos').update({ etapa_id: null }).eq('id', candidateId)
        }
        window.dispatchEvent(new CustomEvent('kanban:reload'))
      }

      // 8. Recarregue a lista
      await fetchData(true)

      // 7. Toast
      toast({
        title: 'Status atualizado com sucesso',
        description:
          novoStatus === 'pre_aprovado'
            ? `Candidato qualificado e adicionado ao Kanban.`
            : `Candidato não qualificado e removido do Kanban.`,
      })
    } catch (err) {
      // Revert if error
      setAnalises((prev) =>
        prev.map((a) => (a.id === analise.id ? { ...a, status: analise.status } : a)),
      )
      toast({
        title: 'Erro ao atualizar status',
        description: 'Não foi possível atualizar o status do currículo. Tente novamente.',
        variant: 'destructive',
      })
    }
  }

  const filteredAnalises = analises.filter((a) => {
    if (filter === 'qualificados') return a.status === 'pre_aprovado'
    if (filter === 'nao_qualificados') return a.status !== 'pre_aprovado'
    return true
  })

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="space-y-4">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-10 w-3/4 max-w-md" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Skeleton className="h-12 w-full max-w-[200px]" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !vaga) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <Button variant="ghost" onClick={() => navigate('/vagas')} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-4">
            <p>{error || 'Vaga não encontrada.'}</p>
            <Button variant="outline" size="sm" onClick={() => fetchData(false)}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto h-full flex flex-col">
      <div className="mb-6 animate-fade-in-up">
        <Button
          variant="ghost"
          onClick={() => navigate('/vagas')}
          className="mb-4 -ml-4 text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Vagas
        </Button>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{vaga.titulo}</h1>
      </div>

      <Tabs defaultValue="candidatos" className="w-full flex-1 flex flex-col">
        <TabsList className="self-start mb-6">
          <TabsTrigger value="candidatos" className="px-6">
            Candidatos
            <Badge variant="secondary" className="ml-2 bg-slate-200 text-slate-700">
              {analises.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="candidatos"
          className="flex-1 focus-visible:outline-none focus-visible:ring-0"
        >
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 animate-fade-in-up">
            <h2 className="text-lg font-medium text-slate-800">
              Candidatos Analisados ({filteredAnalises.length})
            </h2>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-slate-400 hidden sm:block" />
              <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
                <SelectTrigger className="w-full sm:w-[220px] bg-white">
                  <SelectValue placeholder="Filtrar por status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Candidatos</SelectItem>
                  <SelectItem value="qualificados">Qualificados</SelectItem>
                  <SelectItem value="nao_qualificados">Não Qualificados</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {filteredAnalises.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 animate-fade-in-up">
              <FileX2 className="h-12 w-12 text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-700 text-center">
                Nenhum currículo encontrado
              </h3>
              <p className="text-slate-500 text-sm mt-1 text-center">
                Não há candidatos correspondentes ao filtro atual.
              </p>
              <Button variant="outline" className="mt-6" onClick={() => navigate('/vagas')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar para Vagas
              </Button>
            </div>
          ) : (
            <>
              {/* Mobile View */}
              <div className="md:hidden space-y-4 pb-10">
                {filteredAnalises.map((analise, index) => (
                  <MobileCVCard
                    key={analise.id}
                    analise={analise}
                    index={index}
                    onToggleStatus={handleToggleStatus}
                  />
                ))}
              </div>

              {/* Desktop View */}
              <div className="hidden md:block pb-10">
                <DesktopCVTable analises={filteredAnalises} onToggleStatus={handleToggleStatus} />
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { vagaDetalhesService, Vaga, AnaliseCVComCandidato } from '@/services/vaga-detalhes'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ArrowLeft,
  FileText,
  CheckCircle2,
  XCircle,
  Briefcase,
  Code,
  User,
  FileX2,
} from 'lucide-react'

// Simple internal Badge to avoid dependency missing errors
const Badge = ({ children, className = '', variant = 'default' }: any) => {
  const base =
    'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors'
  const variants = {
    default: 'border-transparent bg-slate-900 text-slate-50',
    secondary: 'border-transparent bg-slate-100 text-slate-900',
    outline: 'text-slate-950 border-slate-200',
  }
  return (
    <div
      className={`${base} ${variants[variant as keyof typeof variants] || variants.default} ${className}`}
    >
      {children}
    </div>
  )
}

function CVCard({ analise, index }: { analise: AnaliseCVComCandidato; index: number }) {
  const candidato = analise.candidato
  if (!candidato) return null

  const dadosExtraidos = candidato.dados_extraidos as any
  const experiencia = Array.isArray(dadosExtraidos?.experiencia_profissional)
    ? dadosExtraidos.experiencia_profissional
    : []
  const skills = Array.isArray(dadosExtraidos?.skills) ? dadosExtraidos.skills : []

  return (
    <div
      className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm animate-fade-in-up transition-all hover:shadow-md"
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}
    >
      <div className="flex flex-col md:flex-row justify-between gap-6">
        <div className="space-y-4 flex-1">
          <div>
            <h3 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
              <User className="h-5 w-5 text-slate-400" />
              {candidato.nome}
            </h3>
            <div className="text-sm text-slate-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {candidato.email && <span>{candidato.email}</span>}
              {candidato.telefone && <span>{candidato.telefone}</span>}
            </div>
          </div>

          {analise.status === 'reprovado' && analise.motivo && (
            <div className="bg-red-50 text-red-800 p-3 rounded-md text-sm flex gap-2 items-start border border-red-100">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold block mb-0.5">Motivo da reprovação:</span>
                {analise.motivo}
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {experiencia.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 mb-2">
                  <Briefcase className="h-4 w-4 text-slate-400" /> Experiência
                </h4>
                <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside pl-1">
                  {experiencia.slice(0, 3).map((exp, i) => (
                    <li key={i} className="line-clamp-2">
                      {exp}
                    </li>
                  ))}
                  {experiencia.length > 3 && (
                    <li className="text-slate-400 list-none text-xs mt-1">
                      +{experiencia.length - 3} experiências
                    </li>
                  )}
                </ul>
              </div>
            )}

            {skills.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 mb-2">
                  <Code className="h-4 w-4 text-slate-400" /> Skills
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {skills.slice(0, 8).map((skill, i) => (
                    <Badge key={i} variant="secondary" className="font-normal text-xs">
                      {skill}
                    </Badge>
                  ))}
                  {skills.length > 8 && (
                    <Badge variant="outline" className="font-normal text-xs text-slate-400">
                      +{skills.length - 8}
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col justify-start md:items-end border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6 shrink-0 min-w-[200px]">
          <Button
            variant="outline"
            onClick={() => window.open(candidato.curriculo_url || '#', '_blank')}
            disabled={!candidato.curriculo_url}
            className="w-full"
          >
            <FileText className="h-4 w-4 mr-2" />
            Ver Currículo
          </Button>
          <span className="text-xs text-slate-400 mt-3 text-center md:text-right w-full">
            Analisado em {new Date(analise.criado_em).toLocaleDateString('pt-BR')}
          </span>
        </div>
      </div>
    </div>
  )
}

function CVList({
  analises,
  emptyMessage,
  onBack,
}: {
  analises: AnaliseCVComCandidato[]
  emptyMessage: string
  onBack: () => void
}) {
  if (analises.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50 animate-fade-in-up">
        <FileX2 className="h-12 w-12 text-slate-300 mb-4" />
        <h3 className="text-lg font-medium text-slate-700 text-center">{emptyMessage}</h3>
        <Button variant="outline" className="mt-6" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Vagas
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-10">
      {analises.map((analise, index) => (
        <CVCard key={analise.id} analise={analise} index={index} />
      ))}
    </div>
  )
}

export default function VagaDetalhes() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [vaga, setVaga] = useState<Vaga | null>(null)
  const [analises, setAnalises] = useState<AnaliseCVComCandidato[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'pre_aprovado' | 'reprovado'>('pre_aprovado')

  const fetchData = useCallback(async () => {
    if (!id) return
    try {
      setLoading(true)
      setError(null)
      const [vagaData, analisesData] = await Promise.all([
        vagaDetalhesService.getVaga(id),
        vagaDetalhesService.getAnalises(id),
      ])
      setVaga(vagaData)
      setAnalises(analisesData)
    } catch (err: any) {
      setError('Não foi possível carregar os detalhes da vaga. ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const preAprovados = analises.filter((a) => a.status === 'pre_aprovado')
  const reprovados = analises.filter((a) => a.status === 'reprovado')

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="space-y-4">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-10 w-3/4 max-w-md" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="flex gap-4">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !vaga) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Button variant="ghost" onClick={() => navigate('/vagas')} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-4">
            <p>{error || 'Vaga não encontrada.'}</p>
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto h-full flex flex-col">
      <div className="mb-8 animate-fade-in-up">
        <Button
          variant="ghost"
          onClick={() => navigate('/vagas')}
          className="mb-4 -ml-4 text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Vagas
        </Button>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{vaga.titulo}</h1>
        <p className="text-slate-500 mt-2 flex items-center gap-2">
          Total de <strong>{analises.length}</strong> currículos analisados
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="w-full">
        <div
          className="flex flex-col mb-6 space-y-4 animate-fade-in-up"
          style={{ animationDelay: '100ms' }}
        >
          <TabsList className="hidden sm:inline-flex self-start h-12">
            <TabsTrigger
              value="pre_aprovado"
              className="flex items-center gap-2 px-6 h-full data-[state=active]:bg-white"
            >
              <CheckCircle2
                className={`h-4 w-4 ${activeTab === 'pre_aprovado' ? 'text-green-500' : 'text-slate-400'}`}
              />
              Pré Aprovados
              <Badge
                variant="secondary"
                className={`ml-1 ${activeTab === 'pre_aprovado' ? 'bg-green-100 text-green-700' : ''}`}
              >
                {preAprovados.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="reprovado"
              className="flex items-center gap-2 px-6 h-full data-[state=active]:bg-white"
            >
              <XCircle
                className={`h-4 w-4 ${activeTab === 'reprovado' ? 'text-red-500' : 'text-slate-400'}`}
              />
              Reprovados
              <Badge
                variant="secondary"
                className={`ml-1 ${activeTab === 'reprovado' ? 'bg-red-100 text-red-700' : ''}`}
              >
                {reprovados.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <div className="sm:hidden w-full">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" className="w-full justify-between h-14 bg-white">
                  <span className="flex items-center gap-2 font-medium">
                    {activeTab === 'pre_aprovado' ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    {activeTab === 'pre_aprovado' ? 'Pré Aprovados' : 'Reprovados'}
                    <Badge variant="secondary" className="ml-2">
                      {activeTab === 'pre_aprovado' ? preAprovados.length : reprovados.length}
                    </Badge>
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-2xl pb-8">
                <SheetHeader className="mb-4">
                  <SheetTitle>Filtrar Candidatos</SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-3">
                  <SheetClose asChild>
                    <Button
                      variant={activeTab === 'pre_aprovado' ? 'default' : 'outline'}
                      className="justify-start h-14"
                      onClick={() => setActiveTab('pre_aprovado')}
                    >
                      <CheckCircle2
                        className={`h-5 w-5 mr-3 ${activeTab === 'pre_aprovado' ? 'text-white' : 'text-green-500'}`}
                      />
                      <span className="text-base">Pré Aprovados</span>
                      <Badge
                        variant={activeTab === 'pre_aprovado' ? 'secondary' : 'default'}
                        className="ml-auto"
                      >
                        {preAprovados.length}
                      </Badge>
                    </Button>
                  </SheetClose>
                  <SheetClose asChild>
                    <Button
                      variant={activeTab === 'reprovado' ? 'default' : 'outline'}
                      className="justify-start h-14"
                      onClick={() => setActiveTab('reprovado')}
                    >
                      <XCircle
                        className={`h-5 w-5 mr-3 ${activeTab === 'reprovado' ? 'text-white' : 'text-red-500'}`}
                      />
                      <span className="text-base">Reprovados</span>
                      <Badge
                        variant={activeTab === 'reprovado' ? 'secondary' : 'default'}
                        className="ml-auto"
                      >
                        {reprovados.length}
                      </Badge>
                    </Button>
                  </SheetClose>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        <TabsContent
          value="pre_aprovado"
          className="mt-0 focus-visible:outline-none focus-visible:ring-0"
        >
          <CVList
            analises={preAprovados}
            emptyMessage="Nenhum currículo pré-aprovado para esta vaga no momento."
            onBack={() => navigate('/vagas')}
          />
        </TabsContent>
        <TabsContent
          value="reprovado"
          className="mt-0 focus-visible:outline-none focus-visible:ring-0"
        >
          <CVList
            analises={reprovados}
            emptyMessage="Nenhum currículo reprovado para esta vaga no momento."
            onBack={() => navigate('/vagas')}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

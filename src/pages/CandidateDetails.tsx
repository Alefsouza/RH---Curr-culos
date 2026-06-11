import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import {
  User,
  Mail,
  Phone,
  FileText,
  Trash2,
  Edit,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  MessageSquare,
  Briefcase,
  GraduationCap,
  Star,
  ArrowLeft,
  ShieldAlert,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'

export default function CandidateDetails() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [candidate, setCandidate] = useState<any>(null)
  const [analises, setAnalises] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [messages, setMessages] = useState<any[]>([])

  const [editOpen, setEditOpen] = useState(false)
  const [editData, setEditData] = useState({ nome: '', email: '', telefone: '' })
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [resendingId, setResendingId] = useState<string | null>(null)

  const fetchCandidateData = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const { data: candData, error: candErr } = await supabase
        .from('candidatos')
        .select(`
          *,
          vagas ( titulo ),
          etapas ( nome, cor )
        `)
        .eq('id', id)
        .single()

      if (candErr) throw candErr

      let duplicado = null
      if (candData.duplicado_de) {
        const { data: dupData } = await supabase
          .from('candidatos')
          .select('id, nome')
          .eq('id', candData.duplicado_de)
          .single()

        if (dupData) {
          duplicado = dupData
        }
      }

      setCandidate({ ...candData, duplicado })
      setEditData({
        nome: candData.nome || '',
        email: candData.email || '',
        telefone: candData.telefone || '',
      })

      const { data: analisesData } = await supabase
        .from('analises')
        .select('*, vagas(titulo)')
        .eq('candidato_id', id)
        .order('criado_em', { ascending: false })

      // Deduplicate analises by vaga_id to only show the latest analysis per job
      if (analisesData) {
        const uniqueAnalises: any[] = []
        const seenVagas = new Set()
        for (const a of analisesData) {
          if (!seenVagas.has(a.vaga_id)) {
            seenVagas.add(a.vaga_id)
            uniqueAnalises.push(a)
          }
        }
        setAnalises(uniqueAnalises)
      }

      const { data: histData } = await supabase
        .from('candidato_etapa')
        .select('*, etapas(nome, cor), usuarios(nome)')
        .eq('candidato_id', id)
        .order('criado_em', { ascending: false })
      if (histData) setHistory(histData)

      const { data: msgData } = await supabase
        .from('mensagens_whatsapp')
        .select('*, etapas(nome)')
        .eq('candidato_id', id)
        .not('conteudo', 'is', null)
        .neq('conteudo', '')
        .order('criado_em', { ascending: false })

      if (msgData) {
        setMessages(msgData.filter((m) => m.conteudo && m.conteudo.trim() !== ''))
      }
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Erro ao carregar os dados do candidato.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCandidateData()
  }, [id])

  const handleSaveEdit = async () => {
    if (!editData.nome.trim()) {
      toast.error('Nome é obrigatório')
      return
    }
    if (editData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editData.email)) {
      toast.error('O e-mail informado é inválido')
      return
    }

    try {
      const { error } = await supabase
        .from('candidatos')
        .update({
          nome: editData.nome,
          email: editData.email || null,
          telefone: editData.telefone || null,
        })
        .eq('id', candidate.id)

      if (error) throw error

      toast.success('Dados atualizados com sucesso!')
      setEditOpen(false)
      fetchCandidateData()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar alterações')
    }
  }

  const handleDelete = async () => {
    try {
      const { error } = await supabase.from('candidatos').delete().eq('id', candidate.id)
      if (error) throw error
      toast.success('Candidato excluído com sucesso')
      navigate('/')
    } catch (e: any) {
      toast.error('Erro ao deletar: ' + e.message)
    }
  }

  const resendMessage = async (etapaId: string, msgId: string) => {
    setResendingId(msgId)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token

      const { data, error } = await supabase.functions.invoke('enviar-whatsapp', {
        headers: {
          authorization: `Bearer ${token}`,
        },
        body: { candidato_id: candidate.id, etapa_id: etapaId },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      toast.success('Mensagem reenviada com sucesso!')
      fetchCandidateData()
    } catch (e: any) {
      toast.error(e.message || 'Erro ao reenviar mensagem WhatsApp')
    } finally {
      setResendingId(null)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-4 md:p-6 max-w-6xl space-y-6">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-10 w-full max-w-md" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-[300px] w-full" />
          <Skeleton className="h-[300px] w-full" />
        </div>
      </div>
    )
  }

  if (error || !candidate) {
    return (
      <div className="container mx-auto p-4 md:p-6 max-w-6xl flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <User className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-bold mb-2">
          {error ? 'Erro ao carregar' : 'Candidato não encontrado'}
        </h2>
        <p className="text-muted-foreground mb-6 max-w-md text-center">
          {error ||
            'Não foi possível encontrar as informações deste candidato. Ele pode ter sido excluído.'}
        </p>
        <div className="flex gap-4">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Voltar
          </Button>
          {error && <Button onClick={fetchCandidateData}>Tentar Novamente</Button>}
        </div>
      </div>
    )
  }

  const extraidos = candidate.dados_extraidos || {}
  const experiencia = Array.isArray(extraidos.experiencia_profissional)
    ? extraidos.experiencia_profissional
    : []
  const skills = Array.isArray(extraidos.skills) ? extraidos.skills : []
  const formacao = Array.isArray(extraidos.formacao_academica) ? extraidos.formacao_academica : []
  const endereco =
    extraidos.endereco || extraidos.location || extraidos.cidade || extraidos.estado || null

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-6xl space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="mb-2 -ml-2 text-muted-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
          </Button>
          <h1 className="text-2xl md:text-3xl font-bold flex flex-wrap items-center gap-3">
            {candidate.nome}
            {candidate.duplicado && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Duplicado
              </Badge>
            )}
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
              {candidate.etapas?.nome || 'Sem etapa'}
            </Badge>
          </h1>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-2 text-sm text-slate-600">
            <span className="flex items-center">
              <Mail className="w-4 h-4 mr-1.5 text-slate-400" /> {candidate.email || 'Sem e-mail'}
            </span>
            <span className="flex items-center">
              <Phone className="w-4 h-4 mr-1.5 text-slate-400" />{' '}
              {candidate.telefone || 'Sem telefone'}
            </span>
            <span className="flex items-center">
              <User className="w-4 h-4 mr-1.5 text-slate-400" /> Fonte:{' '}
              {candidate.fonte || 'Desconhecida'}
            </span>
            {endereco && (
              <span className="flex items-center text-xs text-slate-500 border rounded px-2 py-0.5 bg-slate-50">
                Endereço extraído: {endereco}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          {candidate.curriculo_url && (
            <Button
              variant="outline"
              onClick={() => window.open(candidate.curriculo_url, '_blank')}
              className="min-w-[44px]"
            >
              <FileText className="w-4 h-4 mr-2" /> Ver Currículo
            </Button>
          )}
          <Button variant="outline" onClick={() => setEditOpen(true)} className="min-w-[44px]">
            <Edit className="w-4 h-4 mr-2" /> Editar
          </Button>
          <Button
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
            className="min-w-[44px]"
          >
            <Trash2 className="w-4 h-4 mr-2" /> Deletar
          </Button>
        </div>
      </div>

      {candidate.duplicado && (
        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-md flex items-start gap-3 shadow-sm">
          <ShieldAlert className="w-5 h-5 text-yellow-600 mt-0.5 shrink-0" />
          <div>
            <h4 className="font-semibold text-yellow-800">Candidato Duplicado Identificado</h4>
            <p className="text-sm text-yellow-700 mt-1">
              Este registro foi marcado como duplicado pelo sistema. O registro original é:{' '}
              <Link
                to={`/candidato/${candidate.duplicado.id}`}
                className="font-semibold underline hover:text-yellow-900 transition-colors"
              >
                {candidate.duplicado.nome}
              </Link>
            </p>
          </div>
        </div>
      )}

      <Tabs defaultValue="dados" className="w-full">
        <TabsList className="w-full h-auto flex flex-wrap justify-start bg-transparent p-0 gap-2 md:bg-muted md:p-1 md:gap-0 md:inline-flex mb-2">
          <TabsTrigger
            value="dados"
            className="rounded-full border md:border-none md:rounded-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground min-h-[44px] md:min-h-0 px-4"
          >
            Dados do Currículo
          </TabsTrigger>
          <TabsTrigger
            value="analises"
            className="rounded-full border md:border-none md:rounded-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground min-h-[44px] md:min-h-0 px-4"
          >
            Análises de IA
          </TabsTrigger>
          <TabsTrigger
            value="historico"
            className="rounded-full border md:border-none md:rounded-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground min-h-[44px] md:min-h-0 px-4"
          >
            Histórico
          </TabsTrigger>
          <TabsTrigger
            value="mensagens"
            className="rounded-full border md:border-none md:rounded-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground min-h-[44px] md:min-h-0 px-4"
          >
            Mensagens WhatsApp
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dados" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="shadow-elevation border-border">
              <CardHeader className="pb-3 border-b bg-slate-50/50">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-primary" /> Experiência Profissional
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                {experiencia.length > 0 ? (
                  <ul className="space-y-4">
                    {experiencia.map((exp: string, idx: number) => (
                      <li key={idx} className="flex gap-3 items-start">
                        <div className="mt-2 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                        <span className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                          {exp}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-center py-6 text-muted-foreground flex flex-col items-center">
                    <Briefcase className="w-8 h-8 mb-2 opacity-20" />
                    <p className="text-sm italic">
                      Nenhuma experiência foi extraída ou o currículo não a possui.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="shadow-elevation border-border">
                <CardHeader className="pb-3 border-b bg-slate-50/50">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <GraduationCap className="w-5 h-5 text-primary" /> Formação Acadêmica
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  {formacao.length > 0 ? (
                    <ul className="space-y-3">
                      {formacao.map((form: string, idx: number) => (
                        <li key={idx} className="flex gap-3 items-start">
                          <div className="mt-2 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                          <span className="text-sm text-slate-700 leading-relaxed">{form}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">
                      <p className="text-sm italic">Nenhuma formação acadêmica identificada.</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-elevation border-border">
                <CardHeader className="pb-3 border-b bg-slate-50/50">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Star className="w-5 h-5 text-primary" /> Competências (Skills)
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  {skills.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {skills.map((skill: string, idx: number) => (
                        <Badge
                          key={idx}
                          variant="secondary"
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 border-transparent px-3 py-1"
                        >
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">
                      <p className="text-sm italic">Nenhuma habilidade específica identificada.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="analises" className="space-y-4 mt-4">
          {analises.length === 0 ? (
            <div className="text-center p-12 bg-muted/30 rounded-lg border border-dashed flex flex-col items-center">
              <Star className="w-10 h-10 text-slate-300 mb-3" />
              <h3 className="text-lg font-semibold text-slate-700">Sem Análises</h3>
              <p className="text-muted-foreground">
                Este candidato ainda não foi analisado pela IA para nenhuma vaga.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
              {analises.map((a) => (
                <Card key={a.id} className="shadow-elevation border-border overflow-hidden">
                  <CardHeader className="pb-3 bg-slate-50/80 border-b">
                    <div className="flex justify-between items-start gap-4">
                      <CardTitle className="text-base leading-tight">
                        Vaga: {a.vagas?.titulo || 'Desconhecida'}
                      </CardTitle>
                      <Badge
                        variant={
                          a.resultado === 'qualificado'
                            ? 'default'
                            : a.resultado === 'nao_qualificado'
                              ? 'destructive'
                              : 'secondary'
                        }
                        className="shrink-0"
                      >
                        {a.resultado === 'qualificado'
                          ? 'Qualificado'
                          : a.resultado === 'nao_qualificado'
                            ? 'Não Qualificado'
                            : 'Revisar'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="text-sm space-y-4 pt-4">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-700">Aderência calculada:</span>
                      <Badge variant="outline">{a.detalhes?.aderencia || 'N/A'}</Badge>
                    </div>

                    {a.detalhes?.pontos_fortes && a.detalhes.pontos_fortes.length > 0 && (
                      <div className="bg-green-50/50 p-3 rounded-md border border-green-100">
                        <span className="font-semibold text-green-800 flex items-center gap-1.5 mb-2">
                          <CheckCircle className="w-4 h-4" /> Pontos Fortes
                        </span>
                        <ul className="list-disc pl-5 space-y-1 text-slate-600">
                          {a.detalhes.pontos_fortes.map((p: string, i: number) => (
                            <li key={i}>{p}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {a.detalhes?.pontos_fracos && a.detalhes.pontos_fracos.length > 0 && (
                      <div className="bg-red-50/50 p-3 rounded-md border border-red-100">
                        <span className="font-semibold text-red-800 flex items-center gap-1.5 mb-2">
                          <XCircle className="w-4 h-4" /> Pontos a Desenvolver
                        </span>
                        <ul className="list-disc pl-5 space-y-1 text-slate-600">
                          {a.detalhes.pontos_fracos.map((p: string, i: number) => (
                            <li key={i}>{p}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {a.detalhes?.motivo && (
                      <div className="bg-amber-50/50 p-3 rounded-md border border-amber-100 mt-4">
                        <span className="font-semibold text-amber-800 flex items-center gap-1.5 mb-1">
                          Motivo (Regra / Localização)
                        </span>
                        <p className="text-slate-600 text-sm">{a.detalhes.motivo}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="historico" className="space-y-4 mt-4">
          <Card className="shadow-elevation border-border">
            <CardContent className="p-6">
              <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-primary/20 before:via-primary/20 before:to-transparent">
                {history.map((h, i) => (
                  <div
                    key={h.id}
                    className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group"
                  >
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-primary text-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-lg border bg-white shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex flex-col md:flex-row md:items-center justify-between mb-2 gap-1">
                        <h4 className="font-bold text-slate-800">
                          {h.etapas?.nome || 'Etapa Desconhecida'}
                        </h4>
                        <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full inline-flex w-fit">
                          {format(new Date(h.criado_em), "dd/MM/yyyy 'às' HH:mm")}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" /> Movido por:{' '}
                        <span className="font-medium">
                          {h.usuarios?.nome || 'Sistema Automatizado'}
                        </span>
                      </p>
                    </div>
                  </div>
                ))}
                {history.length === 0 && (
                  <p className="text-center text-muted-foreground relative z-10 bg-white py-4">
                    Nenhum histórico de movimentação encontrado.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mensagens" className="space-y-4 mt-4">
          {messages.length === 0 ? (
            <div className="text-center p-12 bg-muted/30 rounded-lg border border-dashed flex flex-col items-center">
              <MessageSquare className="w-10 h-10 text-slate-300 mb-3" />
              <h3 className="text-lg font-semibold text-slate-700">Sem Mensagens</h3>
              <p className="text-muted-foreground">
                Nenhuma comunicação via WhatsApp foi disparada para este candidato ainda.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((m) => (
                <Card key={m.id} className="shadow-elevation border-border">
                  <CardContent className="p-4 flex flex-col sm:flex-row gap-4 justify-between sm:items-center">
                    <div className="flex gap-4 items-center">
                      <div
                        className={cn(
                          'p-3 rounded-full shrink-0',
                          m.status === 'enviada' || m.status === 'entregue' || m.status === 'lida'
                            ? 'bg-green-100 text-green-700'
                            : m.status === 'falha'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-slate-100 text-slate-700',
                        )}
                      >
                        <MessageSquare className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-semibold flex items-center gap-2 text-slate-800">
                          Etapa: {m.etapas?.nome || 'Desconhecida'}
                          <Badge
                            variant={
                              m.status === 'enviada' ||
                              m.status === 'entregue' ||
                              m.status === 'lida'
                                ? 'default'
                                : m.status === 'falha'
                                  ? 'destructive'
                                  : 'secondary'
                            }
                            className="text-[10px] h-5 px-1.5 uppercase tracking-wider"
                          >
                            {m.status === 'enviada'
                              ? 'Enviada'
                              : m.status === 'entregue'
                                ? 'Entregue'
                                : m.status === 'lida'
                                  ? 'Lida'
                                  : m.status === 'falha'
                                    ? 'Falhou'
                                    : m.status}
                          </Badge>
                        </h4>
                        <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          {format(new Date(m.criado_em), "dd 'de' MMM, yyyy 'às' HH:mm", {
                            locale: ptBR,
                          })}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto min-h-[44px]"
                      disabled={resendingId === m.id}
                      onClick={() => resendMessage(m.etapa_id, m.id)}
                    >
                      <RefreshCw
                        className={cn('w-4 h-4 mr-2', resendingId === m.id && 'animate-spin')}
                      />
                      {resendingId === m.id ? 'Reenviando...' : 'Tentar Novamente'}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Dados do Candidato</DialogTitle>
            <DialogDescription>
              Atualize as informações de contato manualmente. O e-mail deve ser válido se informado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nome">
                Nome Completo <span className="text-red-500">*</span>
              </Label>
              <Input
                id="nome"
                placeholder="Ex: João da Silva"
                value={editData.nome}
                onChange={(e) => setEditData({ ...editData, nome: e.target.value })}
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="joao@exemplo.com"
                value={editData.email}
                onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone (WhatsApp)</Label>
              <Input
                id="telefone"
                placeholder="Ex: 11999999999"
                value={editData.telefone}
                onChange={(e) => setEditData({ ...editData, telefone: e.target.value })}
                className="min-h-[44px]"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditOpen(false)} className="min-h-[44px]">
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} className="min-h-[44px]">
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Modal */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Confirmação de Exclusão
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-600">
              Tem certeza que deseja excluir o candidato{' '}
              <strong className="text-slate-800">{candidate?.nome}</strong> permanentemente?
              <br />
              <br />
              Esta ação <span className="font-semibold text-red-600">
                não pode ser desfeita
              </span> e
              removerá todo o histórico, análises e currículo associado da base de dados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} className="min-h-[44px]">
              Manter Candidato
            </Button>
            <Button variant="destructive" onClick={handleDelete} className="min-h-[44px]">
              Sim, Excluir Definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

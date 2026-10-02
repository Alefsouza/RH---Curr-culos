import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getWhatsappDashboardData, WhatsappCandidate } from '@/services/whatsapp'
import { fetchStages } from '@/services/kanban'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  MessageCircle,
  CheckCircle,
  CircleCheckBig,
  XCircle,
  Search,
  User,
  Clock,
  AlertCircle,
  ArrowLeft,
  Send,
  Loader2,
  Trash2,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { sendDirectMessage, deleteConversation } from '@/services/whatsapp'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'

export default function WhatsappPage() {
  const [data, setData] = useState<{
    stats: { sent: number; failed: number; yes: number; no: number }
    statsByStage: Record<string, { sent: number; failed: number; yes: number; no: number }>
    candidates: WhatsappCandidate[]
  } | null>(null)
  const [stages, setStages] = useState<{ id: string; name: string }[]>([])
  const [activeStageId, setActiveStageId] = useState<string>('todos')
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'todos' | 'sim' | 'nao' | 'pendente'>('todos')
  const [search, setSearch] = useState('')
  const [selectedCandidate, setSelectedCandidate] = useState<WhatsappCandidate | null>(null)
  const [messageInput, setMessageInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const isMobile = useIsMobile()

  const loadData = async () => {
    try {
      const [dashboardData, stagesData] = await Promise.all([
        getWhatsappDashboardData(),
        fetchStages(),
      ])
      setData(dashboardData)
      setStages(stagesData)

      setActiveStageId((prev) => {
        if (!prev) return 'todos'
        return prev
      })

      setSelectedCandidate((prev) => {
        if (!prev) return null
        return dashboardData.candidates.find((c) => c.id === prev.id) || null
      })
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteConversation = async () => {
    if (!selectedCandidate || deleting) return
    setDeleting(true)
    try {
      const candidatoId = selectedCandidate.isUnlinked ? null : selectedCandidate.id
      const numeroWhatsapp = selectedCandidate.isUnlinked ? selectedCandidate.telefone : null
      await deleteConversation({ candidato_id: candidatoId, numero_whatsapp: numeroWhatsapp })
      toast({ title: 'Conversa excluída com sucesso.' })
      setSelectedCandidate(null)
      setShowDeleteDialog(false)
      loadData()
    } catch {
      toast({
        title: 'Erro ao excluir conversa',
        description: 'Não foi possível excluir a conversa. Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setDeleting(false)
    }
  }

  const handleSendMessage = async () => {
    const trimmed = messageInput.trim()
    if (!trimmed || !selectedCandidate || sending) return
    setSending(true)
    try {
      const { data, error } = await sendDirectMessage({
        candidato_id: selectedCandidate.isUnlinked ? null : selectedCandidate.id,
        telefone: selectedCandidate.telefone,
        mensagem: trimmed,
      })
      if (error) {
        throw new Error((error as any).message || 'Falha no envio')
      }
      if (data && data.success === false) {
        throw new Error(data.message || 'Falha no envio')
      }
      setMessageInput('')
      toast({
        title: 'Mensagem enviada',
        description: 'A mensagem foi enviada com sucesso.',
      })
      loadData()
    } catch (err: any) {
      toast({
        title: 'Erro ao enviar mensagem',
        description: err?.message || 'Não foi possível enviar a mensagem. Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, 50)
    return () => clearTimeout(timer)
  }, [selectedCandidate?.id, selectedCandidate?.conversations.length])

  useEffect(() => {
    loadData()
    const channel = supabase
      .channel('whatsapp-dashboard')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mensagens_whatsapp' },
        loadData,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'respostas_whatsapp' },
        loadData,
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidatos' }, loadData)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  if (loading && !data) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
        <Skeleton className="h-[500px] w-full" />
      </div>
    )
  }

  if (!loading && !data) {
    return (
      <div className="flex flex-col h-full bg-slate-50/50 p-6 items-center justify-center text-slate-500">
        <XCircle className="h-12 w-12 mb-4 text-red-400" />
        <h2 className="text-xl font-semibold text-slate-700 mb-2">Erro de Conexão</h2>
        <p>Não foi possível carregar as informações do dashboard. Tente recarregar a página.</p>
      </div>
    )
  }

  const filteredCandidates =
    data?.candidates.filter((c) => {
      if (activeStageId !== 'todos' && c.etapaId !== activeStageId) return false
      const response = c.lastResponse
        ?.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
      if (filter === 'sim' && response !== 'sim') return false
      if (filter === 'nao' && response !== 'nao') return false
      if (filter === 'pendente' && (response === 'sim' || response === 'nao')) return false
      if (search && !c.nome.toLowerCase().includes(search.toLowerCase())) return false
      return true
    }) || []

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50/50 min-h-0">
      {/* Header and Summary stats - compact and responsive */}
      <div
        className={cn(
          'p-4 sm:p-6 pb-2 sm:pb-3 flex-shrink-0',
          isMobile && selectedCandidate && 'hidden',
        )}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Dashboard WhatsApp
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm">
              Acompanhe as interações e respostas do Chatbot.
            </p>
          </div>
        </div>

        <div className="w-full overflow-x-auto pb-1 mb-3 scrollbar-thin">
          <Tabs
            value={activeStageId}
            onValueChange={(val) => {
              setActiveStageId(val)
              setSelectedCandidate(null)
            }}
          >
            <TabsList className="h-9 bg-slate-100 p-1 inline-flex w-max min-w-full justify-start">
              <TabsTrigger
                value="todos"
                className="text-xs sm:text-sm font-medium px-3 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm whitespace-nowrap"
              >
                Todos
              </TabsTrigger>
              {stages.map((stage) => (
                <TabsTrigger
                  key={stage.id}
                  value={stage.id}
                  className="text-xs sm:text-sm font-medium px-3 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm whitespace-nowrap"
                >
                  {stage.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 mb-2">
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between py-2 px-3 sm:px-4">
              <CardTitle className="text-xs font-medium text-slate-600">Total Enviadas</CardTitle>
              <MessageCircle className="h-3.5 w-3.5 text-blue-500" />
            </CardHeader>
            <CardContent className="pt-0 pb-2 px-3 sm:px-4">
              <div className="text-lg sm:text-xl font-bold text-slate-800">
                {activeStageId === 'todos'
                  ? data?.stats.sent || 0
                  : data?.statsByStage[activeStageId]?.sent || 0}
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between py-2 px-3 sm:px-4">
              <CardTitle className="text-xs font-medium text-slate-600">Respostas "Sim"</CardTitle>
              <CheckCircle className="h-3.5 w-3.5 text-green-500" />
            </CardHeader>
            <CardContent className="pt-0 pb-2 px-3 sm:px-4">
              <div className="text-lg sm:text-xl font-bold text-slate-800">
                {activeStageId === 'todos'
                  ? data?.stats.yes || 0
                  : data?.statsByStage[activeStageId]?.yes || 0}
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between py-2 px-3 sm:px-4">
              <CardTitle className="text-xs font-medium text-slate-600">Respostas "Não"</CardTitle>
              <XCircle className="h-3.5 w-3.5 text-red-500" />
            </CardHeader>
            <CardContent className="pt-0 pb-2 px-3 sm:px-4">
              <div className="text-lg sm:text-xl font-bold text-slate-800">
                {activeStageId === 'todos'
                  ? data?.stats.no || 0
                  : data?.statsByStage[activeStageId]?.no || 0}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Main chat & conversation card - takes remaining vertical space without overflow */}
      <div
        className={cn(
          'flex-1 overflow-hidden pt-0 min-h-0 flex',
          isMobile ? 'px-0' : 'px-4 sm:px-6 pb-4 sm:pb-6',
        )}
      >
        <Card
          className={cn(
            'flex-1 min-h-0 flex overflow-hidden border-slate-200 shadow-sm',
            isMobile && 'border-0 rounded-none shadow-none',
          )}
        >
          {/* Left Pane - List of Conversations */}
          {(!isMobile || !selectedCandidate) && (
            <div
              className={cn(
                'border-r border-slate-200 bg-white flex flex-col min-h-0',
                isMobile ? 'w-full' : 'w-[320px] lg:w-[350px] shrink-0',
              )}
            >
              {/* Search and Filters */}
              <div className="p-3 border-b border-slate-100 space-y-2 shrink-0">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar candidato..."
                    className="pl-8 h-8 text-xs"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge
                    variant={filter === 'todos' ? 'default' : 'outline'}
                    className="cursor-pointer text-[11px] px-2 py-0.5"
                    onClick={() => setFilter('todos')}
                  >
                    Todos
                  </Badge>
                  <Badge
                    variant={filter === 'sim' ? 'default' : 'outline'}
                    className="cursor-pointer bg-green-50 text-green-700 hover:bg-green-100 border-green-200 text-[11px] px-2 py-0.5"
                    onClick={() => setFilter('sim')}
                  >
                    Sim
                  </Badge>
                  <Badge
                    variant={filter === 'nao' ? 'default' : 'outline'}
                    className="cursor-pointer bg-red-50 text-red-700 hover:bg-red-100 border-red-200 text-[11px] px-2 py-0.5"
                    onClick={() => setFilter('nao')}
                  >
                    Não
                  </Badge>
                  <Badge
                    variant={filter === 'pendente' ? 'default' : 'outline'}
                    className="cursor-pointer bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-200 text-[11px] px-2 py-0.5"
                    onClick={() => setFilter('pendente')}
                  >
                    Pendente
                  </Badge>
                </div>
              </div>

              {/* Scrollable conversation list with dedicated visible vertical scrollbar */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 custom-scrollbar">
                <div className="divide-y divide-slate-100">
                  {filteredCandidates.length === 0 && (
                    <div className="p-6 text-center text-slate-500 text-xs flex flex-col items-center">
                      <MessageCircle className="h-7 w-7 mb-2 text-slate-300" />
                      <p>Nenhuma conversa ativa nesta etapa.</p>
                    </div>
                  )}
                  {filteredCandidates.map((c) => (
                    <div
                      key={c.id}
                      className={cn(
                        'px-3 py-2 sm:px-3.5 sm:py-2.5 cursor-pointer hover:bg-slate-50 transition-colors border-l-2 border-transparent',
                        selectedCandidate?.id === c.id && 'bg-blue-50/70 border-l-[#075e54]',
                      )}
                      onClick={() => setSelectedCandidate(c)}
                    >
                      <div className="flex justify-between items-baseline mb-0.5 gap-1.5">
                        <span className="font-medium text-xs sm:text-[13px] text-slate-900 truncate flex items-center gap-1 leading-tight">
                          {c.isUnlinked && (
                            <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />
                          )}
                          <span className="truncate">{c.nome}</span>
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0 font-normal">
                          {c.lastMessageTime ? format(new Date(c.lastMessageTime), 'HH:mm') : ''}
                        </span>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <p className="text-[11px] leading-tight text-slate-500 truncate max-w-[190px] sm:max-w-[210px]">
                          {c.lastMessage || 'Nenhuma mensagem recente'}
                        </p>
                        {c.lastResponse?.toLowerCase() === 'sim' && (
                          <Badge className="bg-green-500 hover:bg-green-600 text-[9px] px-1.5 py-0 h-4 leading-none shrink-0 font-medium">
                            Sim
                          </Badge>
                        )}
                        {c.lastResponse?.toLowerCase() === 'nao' && (
                          <Badge className="bg-red-500 hover:bg-red-600 text-[9px] px-1.5 py-0 h-4 leading-none shrink-0 font-medium">
                            Não
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Right Pane - Chat */}
          {(!isMobile || selectedCandidate) && (
            <div
              className={cn(
                'bg-[#e5ddd5] flex flex-col relative min-h-0',
                isMobile ? 'w-full flex-1' : 'flex-1',
              )}
            >
              {selectedCandidate ? (
                <>
                  {/* Chat Header */}
                  <div className="h-14 sm:h-16 bg-[#075e54] flex items-center px-3 sm:px-5 shadow-sm z-10 text-white shrink-0">
                    {isMobile && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="mr-1.5 text-white hover:bg-white/20 rounded-full shrink-0 h-8 w-8"
                        onClick={() => setSelectedCandidate(null)}
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                    )}
                    <div className="bg-white/20 p-1.5 sm:p-2 rounded-full mr-2.5 shrink-0">
                      <User className="h-4 w-4 sm:h-5 sm:w-5" />
                    </div>
                    <div className="flex flex-col justify-center min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="font-semibold text-xs sm:text-sm md:text-base flex items-center gap-1.5 truncate leading-tight">
                          {selectedCandidate.isUnlinked && (
                            <span title="Contato não vinculado" className="inline-flex">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                            </span>
                          )}
                          <span className="truncate">{selectedCandidate.nome}</span>
                        </h2>
                        <div className="hidden sm:flex shrink-0">
                          {selectedCandidate.lastResponse?.toLowerCase() === 'sim' ? (
                            <Badge className="bg-green-100 hover:bg-green-100 text-green-800 border-none text-[11px] px-2 py-0.5 h-5 rounded font-medium flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" /> Sim
                            </Badge>
                          ) : selectedCandidate.lastResponse?.toLowerCase() === 'nao' ? (
                            <Badge className="bg-red-100 hover:bg-red-100 text-red-800 border-none text-[11px] px-2 py-0.5 h-5 rounded font-medium flex items-center gap-1">
                              <XCircle className="w-3 h-3" /> Não
                            </Badge>
                          ) : selectedCandidate.isUnlinked ? (
                            <Badge className="bg-amber-100 hover:bg-amber-100 text-amber-800 border-none text-[11px] px-2 py-0.5 h-5 rounded font-medium flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> Não vinculado
                            </Badge>
                          ) : (
                            <Badge className="bg-slate-100 hover:bg-slate-100 text-slate-800 border-none text-[11px] px-2 py-0.5 h-5 rounded font-medium flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Pendente
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-[10px] sm:text-xs text-white/80 truncate">
                          {selectedCandidate.telefone}
                        </p>
                        <div className="flex sm:hidden shrink-0">
                          {selectedCandidate.lastResponse?.toLowerCase() === 'sim' && (
                            <span className="text-green-300">
                              <CheckCircle className="w-3 h-3" />
                            </span>
                          )}
                          {selectedCandidate.lastResponse?.toLowerCase() === 'nao' && (
                            <span className="text-red-300">
                              <XCircle className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto text-white hover:bg-white/20 rounded-full shrink-0 h-8 w-8"
                      onClick={() => setShowDeleteDialog(true)}
                      title="Excluir conversa"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Messages Area - with independent vertical scrollbar and full scroll-to-end */}
                  <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-5 min-h-0 chat-scrollbar">
                    <div className="space-y-3 max-w-3xl mx-auto pb-2">
                      {selectedCandidate.conversations.length === 0 ? (
                        <div className="text-center text-slate-600 text-xs py-8">
                          Nenhuma mensagem registrada nesta conversa.
                        </div>
                      ) : (
                        selectedCandidate.conversations.map((msg) => (
                          <div
                            key={msg.id}
                            className={cn(
                              'flex',
                              msg.direcao === 'enviada' ? 'justify-end' : 'justify-start',
                            )}
                          >
                            <div className="flex flex-col max-w-[92%] sm:max-w-[85%] md:max-w-[80%]">
                              <div
                                className={cn(
                                  'w-fit rounded-lg px-3 py-1.5 shadow-sm relative text-xs sm:text-[13px] leading-relaxed clearfix break-words',
                                  msg.direcao === 'enviada'
                                    ? 'bg-[#dcf8c6] rounded-tr-none self-end text-slate-900'
                                    : 'bg-white rounded-tl-none self-start text-slate-900',
                                )}
                              >
                                <span className="whitespace-pre-wrap break-words align-top">
                                  {msg.texto}
                                </span>
                                <span className="float-right inline-flex items-center gap-1.5 ml-3 mt-1 relative z-10 shrink-0">
                                  {msg.respostaAssociada?.toLowerCase() === 'sim' && (
                                    <span className="flex items-center gap-1 text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium border border-green-200">
                                      <CircleCheckBig className="w-2.5 h-2.5" /> Sim
                                    </span>
                                  )}
                                  {msg.respostaAssociada?.toLowerCase() === 'nao' && (
                                    <span className="flex items-center gap-1 text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium border border-red-200">
                                      <XCircle className="w-2.5 h-2.5" /> Não
                                    </span>
                                  )}
                                  {msg.direcao === 'enviada' && msg.status === 'falha' && (
                                    <span
                                      title="Falha no envio (erro de comunicação/503)"
                                      className="flex items-center gap-1 text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-medium border border-amber-300"
                                    >
                                      <AlertCircle className="w-2.5 h-2.5 text-amber-600" /> Falha
                                      no envio
                                    </span>
                                  )}
                                  <span className="text-[10px] text-slate-500 font-medium leading-none whitespace-nowrap mt-[1px]">
                                    {format(new Date(msg.criado_em), 'HH:mm')}
                                  </span>
                                </span>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  </div>

                  {/* Message Input */}
                  <div className="flex items-end gap-2 p-2.5 sm:p-3 bg-[#f0f2f5] border-t border-slate-200 shrink-0">
                    <textarea
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSendMessage()
                        }
                      }}
                      placeholder="Digite uma mensagem..."
                      rows={1}
                      disabled={sending}
                      className="flex-1 resize-none rounded-lg border border-slate-300 bg-white px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#075e54] focus:border-transparent max-h-32 min-h-[38px] disabled:opacity-50"
                    />
                    <Button
                      size="icon"
                      onClick={handleSendMessage}
                      disabled={!messageInput.trim() || sending}
                      className="bg-[#075e54] hover:bg-[#075e54]/90 rounded-full shrink-0 h-9 w-9 sm:h-10 sm:w-10"
                    >
                      {sending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 bg-[#f0f2f5] p-4 text-center">
                  <MessageCircle className="h-12 w-12 sm:h-16 sm:w-16 mb-3 text-slate-300" />
                  <p className="text-xs sm:text-sm">
                    Selecione um candidato para ver o histórico de conversas.
                  </p>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conversa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir todas as mensagens desta conversa? Esta ação não pode
              ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDeleteConversation()
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleting}
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

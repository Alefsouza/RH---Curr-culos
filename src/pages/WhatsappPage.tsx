import { useEffect, useState } from 'react'
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
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'

export default function WhatsappPage() {
  const [data, setData] = useState<{
    stats: { sent: number; yes: number; no: number }
    statsByStage: Record<string, { sent: number; yes: number; no: number }>
    candidates: WhatsappCandidate[]
  } | null>(null)
  const [stages, setStages] = useState<{ id: string; name: string }[]>([])
  const [activeStageId, setActiveStageId] = useState<string>('todos')
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'todos' | 'sim' | 'nao'>('todos')
  const [search, setSearch] = useState('')
  const [selectedCandidate, setSelectedCandidate] = useState<WhatsappCandidate | null>(null)

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
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-[600px] w-full" />
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
      const response = c.lastResponse?.toLowerCase()
      if (filter === 'sim' && response !== 'sim') return false
      if (filter === 'nao' && response !== 'nao') return false
      if (search && !c.nome.toLowerCase().includes(search.toLowerCase())) return false
      return true
    }) || []

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      <div className={cn('p-6 pb-0 flex-shrink-0', isMobile && selectedCandidate && 'hidden')}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 sm:mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard WhatsApp</h1>
            <p className="text-muted-foreground text-sm">
              Acompanhe as interações e respostas do Chatbot.
            </p>
          </div>
        </div>

        <div className="w-full overflow-x-auto pb-2 mb-4 sm:mb-6 scrollbar-thin">
          <Tabs
            value={activeStageId}
            onValueChange={(val) => {
              setActiveStageId(val)
              setSelectedCandidate(null)
            }}
          >
            <TabsList className="h-10 bg-slate-100 p-1 inline-flex w-max min-w-full justify-start">
              <TabsTrigger
                value="todos"
                className="text-sm font-medium px-4 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm whitespace-nowrap"
              >
                Todos
              </TabsTrigger>
              {stages.map((stage) => (
                <TabsTrigger
                  key={stage.id}
                  value={stage.id}
                  className="text-sm font-medium px-4 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm whitespace-nowrap"
                >
                  {stage.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4 sm:mb-6">
          <Card className="shadow-sm border-slate-200 col-span-2 md:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Total Enviadas</CardTitle>
              <MessageCircle className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-800">
                {activeStageId === 'todos'
                  ? data?.stats.sent || 0
                  : data?.statsByStage[activeStageId]?.sent || 0}
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Respostas "Sim"</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-800">
                {activeStageId === 'todos'
                  ? data?.stats.yes || 0
                  : data?.statsByStage[activeStageId]?.yes || 0}
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Respostas "Não"</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-800">
                {activeStageId === 'todos'
                  ? data?.stats.no || 0
                  : data?.statsByStage[activeStageId]?.no || 0}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className={cn('flex-1 overflow-hidden pt-0', isMobile ? 'px-0' : 'p-6')}>
        <Card
          className={cn(
            'h-full flex overflow-hidden border-slate-200 shadow-sm',
            isMobile && 'border-0 rounded-none shadow-none',
          )}
        >
          {/* Left Pane - List */}
          {(!isMobile || !selectedCandidate) && (
            <div
              className={cn(
                'border-r border-slate-200 bg-white flex flex-col',
                isMobile ? 'w-full' : 'w-[350px]',
              )}
            >
              <div className="p-4 border-b border-slate-100 space-y-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar candidato..."
                    className="pl-8"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant={filter === 'todos' ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => setFilter('todos')}
                  >
                    Todos
                  </Badge>
                  <Badge
                    variant={filter === 'sim' ? 'default' : 'outline'}
                    className="cursor-pointer bg-green-50 text-green-700 hover:bg-green-100 border-green-200"
                    onClick={() => setFilter('sim')}
                  >
                    Sim
                  </Badge>
                  <Badge
                    variant={filter === 'nao' ? 'default' : 'outline'}
                    className="cursor-pointer bg-red-50 text-red-700 hover:bg-red-100 border-red-200"
                    onClick={() => setFilter('nao')}
                  >
                    Não
                  </Badge>
                </div>
              </div>
              <ScrollArea className="flex-1">
                <div className="divide-y divide-slate-100">
                  {filteredCandidates.length === 0 && (
                    <div className="p-6 text-center text-slate-500 text-sm flex flex-col items-center">
                      <MessageCircle className="h-8 w-8 mb-2 text-slate-300" />
                      <p>Nenhuma conversa ativa nesta etapa.</p>
                    </div>
                  )}
                  {filteredCandidates.map((c) => (
                    <div
                      key={c.id}
                      className={cn(
                        'p-4 cursor-pointer hover:bg-slate-50 transition-colors',
                        selectedCandidate?.id === c.id && 'bg-blue-50/50',
                      )}
                      onClick={() => setSelectedCandidate(c)}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-medium text-sm text-slate-900 truncate pr-2 flex items-center gap-1.5">
                          {c.isUnlinked && (
                            <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                          )}
                          {c.nome}
                        </span>
                        <span className="text-xs text-slate-400 flex-shrink-0">
                          {c.lastMessageTime ? format(new Date(c.lastMessageTime), 'HH:mm') : ''}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <p className="text-xs text-slate-500 truncate max-w-[200px]">
                          {c.lastMessage}
                        </p>
                        {c.lastResponse?.toLowerCase() === 'sim' && (
                          <Badge className="bg-green-500 text-[10px] px-1.5 py-0">Sim</Badge>
                        )}
                        {c.lastResponse?.toLowerCase() === 'nao' && (
                          <Badge className="bg-red-500 text-[10px] px-1.5 py-0">Não</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Right Pane - Chat */}
          {(!isMobile || selectedCandidate) && (
            <div
              className={cn(
                'bg-[#e5ddd5] flex flex-col relative',
                isMobile ? 'w-full flex-1' : 'flex-1',
              )}
            >
              {selectedCandidate ? (
                <>
                  <div className="h-16 bg-[#075e54] flex items-center px-4 sm:px-6 shadow-md z-10 text-white">
                    {isMobile && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="mr-2 text-white hover:bg-white/20 rounded-full shrink-0"
                        onClick={() => setSelectedCandidate(null)}
                      >
                        <ArrowLeft className="h-5 w-5" />
                      </Button>
                    )}
                    <div className="bg-white/20 p-2 rounded-full mr-3 shrink-0">
                      <User className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col justify-center min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="font-semibold text-sm sm:text-base flex items-center gap-1.5 truncate">
                          {selectedCandidate.isUnlinked && (
                            <AlertCircle
                              className="w-4 h-4 text-amber-300 shrink-0"
                              title="Contato não vinculado"
                            />
                          )}
                          <span className="truncate">{selectedCandidate.nome}</span>
                        </h2>
                        <div className="hidden sm:flex shrink-0">
                          {selectedCandidate.lastResponse?.toLowerCase() === 'sim' ? (
                            <Badge className="bg-green-100 hover:bg-green-100 text-green-800 border-none text-xs px-2 py-0.5 h-5 rounded-md font-medium flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" /> Sim
                            </Badge>
                          ) : selectedCandidate.lastResponse?.toLowerCase() === 'nao' ? (
                            <Badge className="bg-red-100 hover:bg-red-100 text-red-800 border-none text-xs px-2 py-0.5 h-5 rounded-md font-medium flex items-center gap-1">
                              <XCircle className="w-3 h-3" /> Não
                            </Badge>
                          ) : selectedCandidate.isUnlinked ? (
                            <Badge className="bg-amber-100 hover:bg-amber-100 text-amber-800 border-none text-xs px-2 py-0.5 h-5 rounded-md font-medium flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> Não vinculado
                            </Badge>
                          ) : (
                            <Badge className="bg-slate-100 hover:bg-slate-100 text-slate-800 border-none text-xs px-2 py-0.5 h-5 rounded-md font-medium flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Pendente
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-[11px] sm:text-xs text-white/80 truncate">
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
                  </div>
                  <ScrollArea className="flex-1 p-6">
                    <div className="space-y-4 max-w-3xl mx-auto pb-4">
                      {selectedCandidate.conversations.map((msg) => (
                        <div
                          key={msg.id}
                          className={cn(
                            'flex',
                            msg.direcao === 'enviada' ? 'justify-end' : 'justify-start',
                          )}
                        >
                          <div className="flex flex-col">
                            <div
                              className={cn(
                                'w-fit max-w-[98%] sm:max-w-[98%] md:max-w-[95%] rounded-lg px-3 py-2 shadow-sm relative text-[15px] sm:text-sm clearfix',
                                msg.direcao === 'enviada'
                                  ? 'bg-[#dcf8c6] rounded-tr-none self-end'
                                  : 'bg-white rounded-tl-none self-start',
                              )}
                            >
                              <span className="whitespace-pre-wrap break-words align-top">
                                {msg.texto}
                              </span>
                              <span className="float-right inline-flex items-center gap-1.5 ml-3 mt-1 mb-[-2px] relative z-10">
                                {msg.respostaAssociada?.toLowerCase() === 'sim' && (
                                  <span className="flex items-center gap-1 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium border border-green-200">
                                    <CircleCheckBig className="w-3 h-3" /> Interesse: Sim
                                  </span>
                                )}
                                {msg.respostaAssociada?.toLowerCase() === 'nao' && (
                                  <span className="flex items-center gap-1 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium border border-red-200">
                                    <XCircle className="w-3 h-3" /> Interesse: Não
                                  </span>
                                )}
                                <span className="text-[10px] text-slate-500 font-medium leading-none whitespace-nowrap mt-[1px]">
                                  {format(new Date(msg.criado_em), 'HH:mm')}
                                </span>
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 bg-[#f0f2f5] p-4 text-center">
                  <MessageCircle className="h-16 w-16 mb-4 text-slate-300" />
                  <p>Selecione um candidato para ver o histórico.</p>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

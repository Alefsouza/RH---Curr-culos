import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getWhatsappDashboardData, WhatsappCandidate } from '@/services/whatsapp'
import { Skeleton } from '@/components/ui/skeleton'
import { MessageCircle, CheckCircle, XCircle, Search, User, Clock } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

export default function WhatsappPage() {
  const [data, setData] = useState<{ stats: any; candidates: WhatsappCandidate[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'todos' | 'sim' | 'nao'>('todos')
  const [search, setSearch] = useState('')
  const [selectedCandidate, setSelectedCandidate] = useState<WhatsappCandidate | null>(null)

  const loadData = async () => {
    try {
      const dashboardData = await getWhatsappDashboardData()
      setData(dashboardData)
      setSelectedCandidate((prev) => {
        if (!prev) return null
        return dashboardData.candidates.find((c) => c.id === prev.id) || prev
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
        { event: '*', schema: 'public', table: 'conversas_whatsapp' },
        loadData,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mensagens_whatsapp' },
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
      if (filter === 'sim' && c.lastResponse !== 'sim') return false
      if (filter === 'nao' && c.lastResponse !== 'nao') return false
      if (search && !c.nome.toLowerCase().includes(search.toLowerCase())) return false
      return true
    }) || []

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      <div className="p-6 pb-0 flex-shrink-0">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard WhatsApp</h1>
            <p className="text-muted-foreground text-sm">
              Acompanhe as interações e respostas do Chatbot.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Total Enviadas</CardTitle>
              <MessageCircle className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-800">{data?.stats.sent}</div>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Respostas "Sim"</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-800">{data?.stats.yes}</div>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Respostas "Não"</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-800">{data?.stats.no}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-6 pt-0">
        <Card className="h-full flex overflow-hidden border-slate-200 shadow-sm">
          {/* Left Pane - List */}
          <div className="w-[350px] border-r border-slate-200 bg-white flex flex-col">
            <div className="p-4 border-b border-slate-100 space-y-4">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar candidato..."
                  className="pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
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
                  <div className="p-6 text-center text-slate-500 text-sm">
                    Nenhum candidato encontrado.
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
                      <span className="font-medium text-sm text-slate-900 truncate pr-2">
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
                      {c.lastResponse === 'sim' && (
                        <Badge className="bg-green-500 text-[10px] px-1.5 py-0">Sim</Badge>
                      )}
                      {c.lastResponse === 'nao' && (
                        <Badge className="bg-red-500 text-[10px] px-1.5 py-0">Não</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Right Pane - Chat */}
          <div className="flex-1 bg-[#e5ddd5] flex flex-col relative">
            {selectedCandidate ? (
              <>
                <div className="h-16 bg-[#075e54] flex items-center px-6 shadow-md z-10 text-white">
                  <div className="bg-white/20 p-2 rounded-full mr-3">
                    <User className="h-5 w-5" />
                  </div>
                  <div className="flex flex-col justify-center">
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-sm">{selectedCandidate.nome}</h2>
                      {selectedCandidate.lastResponse === 'sim' ? (
                        <Badge className="bg-green-100 hover:bg-green-100 text-green-800 border-none text-xs px-2 py-0.5 h-5 rounded-md font-medium flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Sim
                        </Badge>
                      ) : selectedCandidate.lastResponse === 'nao' ? (
                        <Badge className="bg-red-100 hover:bg-red-100 text-red-800 border-none text-xs px-2 py-0.5 h-5 rounded-md font-medium flex items-center gap-1">
                          <XCircle className="w-3 h-3" /> Não
                        </Badge>
                      ) : (
                        <Badge className="bg-slate-100 hover:bg-slate-100 text-slate-800 border-none text-xs px-2 py-0.5 h-5 rounded-md font-medium flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Pendente
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-white/80">{selectedCandidate.telefone}</p>
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
                        <div
                          className={cn(
                            'max-w-[70%] rounded-lg p-3 shadow-sm relative text-sm',
                            msg.direcao === 'enviada'
                              ? 'bg-[#dcf8c6] rounded-tr-none'
                              : 'bg-white rounded-tl-none',
                          )}
                        >
                          <p className="whitespace-pre-wrap break-words">{msg.texto}</p>
                          <span className="text-[10px] text-slate-500 block text-right mt-1">
                            {format(new Date(msg.criado_em), 'HH:mm')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 bg-[#f0f2f5]">
                <MessageCircle className="h-16 w-16 mb-4 text-slate-300" />
                <p>Selecione um candidato para ver o histórico.</p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

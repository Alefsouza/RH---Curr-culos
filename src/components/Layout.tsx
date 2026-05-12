import { Outlet } from 'react-router-dom'
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/AppSidebar'
import { Input } from '@/components/ui/input'
import { Bell, Search, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'

export default function Layout() {
  const { user, signOut } = useAuth()
  const { toast } = useToast()

  const [isNotificationOpen, setIsNotificationOpen] = useState(false)
  const [hasUnread, setHasUnread] = useState(false)
  const [newCVs, setNewCVs] = useState<any[]>([])

  const fetchRecentCVs = async (showToastMessage = false) => {
    if (!user) return

    try {
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()

      const { data, error } = await supabase
        .from('candidatos')
        .select(`
          id,
          nome,
          email,
          criado_em,
          vagas ( titulo ),
          analise_cv ( status ),
          analises ( resultado )
        `)
        .eq('user_id', user.id)
        .gte('criado_em', fiveMinsAgo)
        .order('criado_em', { ascending: false })

      if (error) throw error

      setNewCVs(data || [])

      if (data && data.length > 0 && !isNotificationOpen) {
        setHasUnread(true)
      } else if (data && data.length === 0) {
        setHasUnread(false)
      }

      if (showToastMessage) {
        toast({ title: 'Novos currículos carregados' })
      }
    } catch (err) {
      console.error(err)
      if (showToastMessage) {
        toast({ title: 'Erro ao carregar currículos', variant: 'destructive' })
      }
    }
  }

  useEffect(() => {
    if (!user) return

    fetchRecentCVs()

    const channel = supabase
      .channel('new-cvs')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'candidatos',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchRecentCVs()
          setHasUnread(true)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  const handleOpenNotification = (open: boolean) => {
    setIsNotificationOpen(open)
    if (open) {
      fetchRecentCVs(true)
    } else {
      setHasUnread(false)
    }
  }

  const getStatusDisplay = (cv: any) => {
    let statusText = 'Pendente'
    let isQualified = false

    if (cv.analise_cv && cv.analise_cv.length > 0) {
      const s = cv.analise_cv[0].status
      if (s === 'pre_aprovado') {
        statusText = 'Qualificado'
        isQualified = true
      } else if (s === 'reprovado') {
        statusText = 'Não Qualificado'
      }
    } else if (cv.analises && cv.analises.length > 0) {
      const r = cv.analises[0].resultado
      if (r === 'qualificado' || r === 'pre_aprovado') {
        statusText = 'Qualificado'
        isQualified = true
      } else if (r === 'nao_qualificado' || r === 'reprovado') {
        statusText = 'Não Qualificado'
      }
    }

    return { text: statusText, isQualified }
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />

        <SidebarInset className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
          <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-primary/10 bg-primary text-primary-foreground sticky top-0 z-10">
            <div className="flex items-center gap-4 flex-1">
              <SidebarTrigger className="text-primary-foreground/70 hover:text-primary-foreground" />

              <div className="hidden md:flex relative w-full max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary-foreground/50" />
                <Input
                  placeholder="Buscar candidatos por nome..."
                  className="pl-9 bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground placeholder:text-primary-foreground/50 focus-visible:ring-primary-foreground h-11"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              {user && (
                <span className="hidden sm:inline-block text-sm text-primary-foreground/90 font-medium">
                  {user.email}
                </span>
              )}

              <Sheet open={isNotificationOpen} onOpenChange={handleOpenNotification}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                  >
                    <Bell className="h-5 w-5" />
                    {hasUnread && (
                      <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-red-500 rounded-full border border-primary"></span>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-full sm:max-w-md flex flex-col">
                  <SheetHeader className="pb-4 border-b">
                    <SheetTitle>Novos Currículos (Últimos 5 min)</SheetTitle>
                  </SheetHeader>
                  <ScrollArea className="flex-1 -mx-6 px-6 py-4">
                    {newCVs.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8">
                        Nenhum currículo novo nos últimos 5 minutos.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {newCVs.map((cv) => {
                          const status = getStatusDisplay(cv)
                          const vagaTitulo = Array.isArray(cv.vagas)
                            ? cv.vagas[0]?.titulo
                            : cv.vagas?.titulo

                          return (
                            <div
                              key={cv.id}
                              className="p-4 rounded-lg border bg-card text-card-foreground shadow-sm"
                            >
                              <div className="flex justify-between items-start mb-2">
                                <h4 className="font-semibold text-base">{cv.nome}</h4>
                                <span
                                  className={`text-xs px-2 py-1 rounded-full font-medium ${
                                    status.isQualified
                                      ? 'bg-green-100 text-green-800'
                                      : status.text === 'Não Qualificado'
                                        ? 'bg-red-100 text-red-800'
                                        : 'bg-slate-100 text-slate-800'
                                  }`}
                                >
                                  {status.text}
                                </span>
                              </div>
                              <div className="text-sm text-muted-foreground space-y-1">
                                <p>
                                  <span className="font-medium text-foreground">Email:</span>{' '}
                                  {cv.email || 'Não informado'}
                                </p>
                                <p>
                                  <span className="font-medium text-foreground">Vaga:</span>{' '}
                                  {vagaTitulo || 'Não informada'}
                                </p>
                                <p className="text-xs pt-2">
                                  Recebido em:{' '}
                                  {new Date(cv.criado_em).toLocaleTimeString('pt-BR', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </ScrollArea>
                </SheetContent>
              </Sheet>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => signOut()}
                className="text-primary-foreground/70 hover:text-red-400 hover:bg-primary-foreground/10"
                title="Sair"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </header>

          <main className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}

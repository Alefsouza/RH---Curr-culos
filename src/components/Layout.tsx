import { useCallback, useEffect, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import {
  Bell,
  Briefcase,
  ChevronDown,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircleCode,
  MessageSquare,
  Plus,
  RefreshCw,
  Settings,
  SquareKanban,
  UserCircle,
  Users,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface MenuItem {
  label: string
  to: string
  icon: LucideIcon
  adminOnly?: boolean
}

const MENU: MenuItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Quadro Kanban', to: '/', icon: SquareKanban },
  { label: 'Vagas', to: '/vagas', icon: Briefcase },
  { label: 'Candidatos', to: '/candidatos', icon: Users },
  { label: 'Revisão de IA', to: '/revisao', icon: ClipboardCheck },
  { label: 'Templates', to: '/templates', icon: MessageSquare },
  { label: 'WhatsApp', to: '/whatsapp', icon: MessageCircleCode },
  { label: 'Sincronização', to: '/sincronizacao', icon: RefreshCw },
  { label: 'Configurações', to: '/configuracoes', icon: Settings },
  { label: 'Usuários', to: '/usuarios', icon: Users, adminOnly: true },
]

const LOGO_SRC =
  'https://wrnhfpncasqifaisvyaf.supabase.co/storage/v1/object/public/assets/logo_branco_transparente_nitido-80a6a-BIUCr1YD.png'

function pageLabel(pathname: string): string {
  const item = MENU.find((entry) => entry.to === pathname)
  if (item) return item.label
  if (pathname.startsWith('/candidato/')) return 'Detalhes do candidato'
  if (pathname.startsWith('/vaga/')) return 'Detalhes da vaga'
  if (pathname.startsWith('/perfil')) return 'Meu perfil'
  return 'Página'
}

function initials(name?: string | null): string {
  if (!name) return 'U'
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function greetingFor(name?: string | null): string {
  const hour = new Date().getHours()
  const prefix = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
  const first = name?.trim().split(/\s+/)[0]
  return first ? `${prefix}, ${first}` : prefix
}

function Brand() {
  const [imgFailed, setImgFailed] = useState(false)

  if (imgFailed) {
    return (
      <div className="flex items-center gap-2.5">
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-primary/20 text-sm font-bold text-white">
          VS
        </div>
        <span className="truncate text-base font-bold text-white">Via Sudeste</span>
      </div>
    )
  }

  return (
    <div className="flex w-full items-center justify-center text-center">
      <img
        src={LOGO_SRC}
        alt="Via Sudeste"
        onError={() => setImgFailed(true)}
        className="mx-auto"
      />
    </div>
  )
}

function SidebarNav({
  onNavigate,
  isAdmin,
  userId,
}: {
  onNavigate?: () => void
  isAdmin: boolean
  userId?: string
}) {
  const location = useLocation()
  const items = MENU.filter((item) => (item.adminOnly ? isAdmin : true))

  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
      {userId && (
        <Link
          to={`/candidatar/${userId}`}
          onClick={onNavigate}
          className="mb-3 flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90"
        >
          <Plus className="h-[18px] w-[18px] flex-none" />
          <span>Novo Candidato</span>
        </Link>
      )}

      {items.map((item) => {
        const isActive = location.pathname === item.to

        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
              isActive
                ? 'bg-primary text-white shadow-sm'
                : 'text-emerald-100/70 hover:bg-white/5 hover:text-white',
            )}
          >
            <span
              className={cn(
                'absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-emerald-300 transition-all duration-200',
                isActive ? 'opacity-100' : 'opacity-0',
              )}
            />
            <item.icon className="h-[18px] w-[18px] flex-none" />
            <span className="truncate">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

export default function Layout() {
  const { user, profile, signOut } = useAuth()
  const { toast } = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const isWhatsappPage = location.pathname.startsWith('/whatsapp')

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isNotificationOpen, setIsNotificationOpen] = useState(false)
  const [hasUnread, setHasUnread] = useState(false)
  const [newCVs, setNewCVs] = useState<any[]>([])

  const displayName = profile?.nome || user?.email || 'Usuário Via Sudeste'
  const isAdmin = Boolean(profile?.is_admin)

  const fetchRecentCVs = useCallback(
    async (showToastMessage = false) => {
      if (!user) return

      try {
        const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()

        const { data, error } = await supabase
          .from('candidatos')
          .select(
            `
          id,
          nome,
          email,
          criado_em,
          vagas ( titulo ),
          analises ( resultado )
        `,
          )
          .is('duplicado_de', null)
          .is('deleted_at', null)
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
    },
    [user, isNotificationOpen, toast],
  )

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
  }, [user, fetchRecentCVs])

  useEffect(() => {
    setDrawerOpen(false)
    setMenuOpen(false)
  }, [location.pathname])

  const handleOpenNotification = (open: boolean) => {
    setIsNotificationOpen(open)
    if (open) {
      fetchRecentCVs(true)
    } else {
      setHasUnread(false)
    }
  }

  const handleSignOut = async () => {
    setMenuOpen(false)
    await signOut()
    navigate('/auth', { replace: true })
  }

  const getStatusDisplay = (cv: any) => {
    let statusText = 'Pendente'
    let isQualified = false

    if (cv.analises && cv.analises.length > 0) {
      const r = cv.analises[0].resultado
      if (r === 'qualificado' || r === 'pre_aprovado') {
        statusText = 'Qualificado'
        isQualified = true
      } else if (r === 'retirado_kanban') {
        statusText = 'Retirado Kanban'
      } else if (r === 'nao_qualificado' || r === 'reprovado') {
        statusText = 'Não Qualificado'
      } else if (r === 'revisar') {
        statusText = 'Revisar'
      }
    }

    return { text: statusText, isQualified }
  }

  const sidebarFooter = (
    <div className="border-t border-white/10 p-3">
      <div className="mb-2 rounded-lg bg-white/5 p-2.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2 items-center justify-center">
            <span className="animate-ping-dot absolute inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="text-xs font-semibold text-emerald-200">Monitorando currículos</span>
        </div>
        <div className="mt-1 text-[11px] text-emerald-100/60">
          <p>Novos envios dos últimos 5 minutos</p>
          <p className="text-emerald-100/70">
            {newCVs.length > 0
              ? `${newCVs.length} currículo(s) recebido(s)`
              : 'Nenhum currículo novo'}
          </p>
        </div>
      </div>

      <div className="relative mt-2">
        {menuOpen && <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />}
        <button
          type="button"
          onClick={() => setMenuOpen((value) => !value)}
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-white/5"
        >
          <Avatar className="h-9 w-9 flex-none border border-emerald-400/20">
            {profile?.avatar_url && (
              <AvatarImage src={profile.avatar_url} alt={displayName} className="object-cover" />
            )}
            <AvatarFallback className="bg-primary text-xs font-bold uppercase text-white">
              {initials(profile?.nome || user?.email)}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-xs font-semibold text-white">{displayName}</span>
            <span className="mt-0.5 inline-flex rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
              {profile?.is_admin ? 'Administrador' : 'Recrutador(a)'}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 flex-none text-emerald-200/60" />
        </button>

        {menuOpen && (
          <div className="absolute bottom-full left-0 right-0 z-40 mb-2 overflow-hidden rounded-lg border border-white/10 bg-[#0F2A1C] shadow-xl">
            <Link
              to="/perfil"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-emerald-50 transition-colors hover:bg-white/5"
              onClick={() => setMenuOpen(false)}
            >
              <UserCircle className="h-4 w-4" />
              Meu perfil
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-emerald-50 transition-colors hover:bg-white/5"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex h-screen max-h-screen w-full overflow-hidden bg-background">
      {/* Sidebar desktop */}
      <aside className="hidden h-screen w-[264px] shrink-0 flex-col bg-[#0C1B14] md:flex">
        <div className="flex h-[68px] items-center justify-center border-b border-white/10 px-5 text-center">
          <Brand />
        </div>
        <SidebarNav isAdmin={isAdmin} userId={user?.id} />
        {sidebarFooter}
      </aside>

      {/* Sidebar móvel (drawer) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[264px] flex-col bg-[#0C1B14] shadow-xl">
            <div className="flex h-[68px] items-center justify-between border-b border-white/10 px-5">
              <Brand />
              <button
                type="button"
                aria-label="Fechar menu"
                onClick={() => setDrawerOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-emerald-100/70 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SidebarNav
              isAdmin={isAdmin}
              userId={user?.id}
              onNavigate={() => setDrawerOpen(false)}
            />
            {sidebarFooter}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-[68px] flex-none items-center gap-3 border-b bg-white px-4 shadow-sm md:px-6">
          <button
            type="button"
            aria-label="Abrir menu"
            onClick={() => setDrawerOpen(true)}
            className="flex h-10 w-10 flex-none items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:bg-muted md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0">
            <h1 className="truncate text-base font-bold leading-tight text-foreground md:text-[17px]">
              Via Sudeste - Gestão de Currículos
            </h1>
            <p className="truncate text-xs text-muted-foreground">{pageLabel(location.pathname)}</p>
          </div>

          <div className="ml-auto flex items-center gap-3 lg:gap-5">
            <div className="hidden text-right lg:block">
              <p className="text-sm font-semibold leading-tight text-foreground">
                {greetingFor(profile?.nome)}
              </p>
              <p className="max-w-[260px] truncate text-xs text-muted-foreground">{user?.email}</p>
            </div>

            <Sheet open={isNotificationOpen} onOpenChange={handleOpenNotification}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="Notificações"
                  className="relative flex h-10 w-10 items-center justify-center rounded-full border bg-white text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Bell className="h-[18px] w-[18px]" />
                  {hasUnread && (
                    <span className="animate-pulse-badge absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500" />
                  )}
                </button>
              </SheetTrigger>
              <SheetContent className="flex w-full flex-col sm:max-w-md">
                <SheetHeader className="border-b pb-4">
                  <SheetTitle>Novos Currículos (Últimos 5 min)</SheetTitle>
                </SheetHeader>
                <ScrollArea className="-mx-6 flex-1 px-6 py-4">
                  {newCVs.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground">
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
                            className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm"
                          >
                            <div className="mb-2 flex items-start justify-between">
                              <h4 className="text-base font-semibold">{cv.nome}</h4>
                              <span
                                className={`rounded-full px-2 py-1 text-xs font-medium ${
                                  status.isQualified
                                    ? 'bg-green-100 text-green-800'
                                    : status.text === 'Retirado Kanban'
                                      ? 'bg-amber-100 text-amber-800'
                                      : status.text === 'Não Qualificado'
                                        ? 'bg-red-100 text-red-800'
                                        : 'bg-slate-100 text-slate-800'
                                }`}
                              >
                                {status.text}
                              </span>
                            </div>
                            <div className="space-y-1 text-sm text-muted-foreground">
                              <p>
                                <span className="font-medium text-foreground">Email:</span>{' '}
                                {cv.email || 'Não informado'}
                              </p>
                              <p>
                                <span className="font-medium text-foreground">Vaga:</span>{' '}
                                {vagaTitulo || 'Não informada'}
                              </p>
                              <p className="pt-2 text-xs">
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
          </div>
        </header>

        <main
          key={location.pathname}
          className={cn(
            'animate-fade-up flex min-h-0 flex-1',
            isWhatsappPage ? 'overflow-hidden p-0' : 'overflow-y-auto p-4 md:p-6',
          )}
        >
          <div className="flex min-h-0 w-full flex-1 flex-col">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

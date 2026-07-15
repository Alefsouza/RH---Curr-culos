import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Plus,
  MessageSquare,
  ClipboardCheck,
  MessageCircleCode,
  RefreshCw,
  Settings,
  SquareKanban,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

export function AppSidebar() {
  const location = useLocation()
  const { profile, user } = useAuth()

  const navItems = [
    { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
    { title: 'Quadro Kanban', url: '/', icon: SquareKanban },
    { title: 'Vagas', url: '/vagas', icon: Briefcase },
    { title: 'Candidatos', url: '/candidatos', icon: Users },
    { title: 'Revisão de IA', url: '/revisao', icon: ClipboardCheck },
    { title: 'Templates', url: '/templates', icon: MessageSquare },
    { title: 'WhatsApp', url: '/whatsapp', icon: MessageCircleCode },
    { title: 'Sincronização', url: '/sincronizacao', icon: RefreshCw },
    { title: 'Configurações', url: '/configuracoes', icon: Settings },
    ...(profile?.is_admin ? [{ title: 'Usuários', url: '/usuarios', icon: Users }] : []),
  ]

  return (
    <Sidebar className="border-r border-border bg-sidebar">
      <SidebarHeader className="h-16 flex items-center justify-center border-b border-border">
        <div className="flex items-center justify-center px-4 w-full">
          <img
            src="https://pagamentos.goskip.app/visual-edits/sem-nome-190-50-px-610b0304.png"
            alt="Logo Via Sudeste"
            className="h-9 w-auto max-w-[180px] object-contain"
          />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="py-4">
          <div className="px-4 mb-6">
            <Button asChild className="w-full justify-start gap-2 shadow-sm">
              <Link to={`/candidatar/${user?.id}`}>
                <Plus className="h-4 w-4" />
                <span>Novo Candidato</span>
              </Link>
            </Button>
          </div>

          <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-4">
            Menu Principal
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.url}
                    className="data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-semibold text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors h-11"
                  >
                    <Link to={item.url} className="flex items-center gap-3">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border p-3">
        <Link
          to="/perfil"
          className="flex items-center gap-3 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground p-2 rounded-md transition-colors w-full"
        >
          <Avatar className="h-10 w-10 border border-border">
            <AvatarImage src={profile?.avatar_url || ''} className="object-cover" />
            <AvatarFallback className="bg-primary/10 text-primary font-medium">
              {profile?.nome?.substring(0, 2).toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-medium leading-none truncate">
              {profile?.nome || 'Usuário'}
            </span>
            <span className="text-xs text-muted-foreground mt-1 truncate">
              {profile?.is_admin ? 'Administrador' : 'Recrutador(a)'}
            </span>
          </div>
        </Link>
      </SidebarFooter>
    </Sidebar>
  )
}

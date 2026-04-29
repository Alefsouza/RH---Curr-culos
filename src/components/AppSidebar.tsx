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
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Settings,
  Plus,
  SquareKanban,
  MessageSquare,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

export function AppSidebar() {
  const location = useLocation()
  const { profile } = useAuth()

  const navItems = [
    { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
    { title: 'Quadro Kanban', url: '/', icon: SquareKanban },
    { title: 'Vagas', url: '/vagas', icon: Briefcase },
    { title: 'Candidatos', url: '/candidatos', icon: Users },
    { title: 'Mensagens', url: '/templates', icon: MessageSquare },
    { title: 'Configurações', url: '#', icon: Settings },
    ...(profile?.is_admin ? [{ title: 'Usuários', url: '/usuarios', icon: Users }] : []),
  ]

  return (
    <Sidebar className="border-r border-border bg-sidebar">
      <SidebarHeader className="h-16 flex items-center justify-center border-b border-border">
        <div className="flex items-center gap-2 px-4 w-full">
          <div className="bg-primary p-1.5 rounded-lg">
            <SquareKanban className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg text-sidebar-foreground tracking-tight">
            Via Sudeste
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="py-4">
          <div className="px-4 mb-6">
            <Button className="w-full justify-start gap-2 shadow-sm">
              <Plus className="h-4 w-4" />
              <span>Novo Candidato</span>
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

      <SidebarFooter className="border-t border-border p-4">
        <div className="flex items-center gap-3">
          <img
            src="https://img.usecurling.com/ppl/thumbnail?gender=female&seed=1"
            alt="User Avatar"
            className="h-10 w-10 rounded-full ring-2 ring-border"
          />
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground leading-none">
              {profile?.nome || 'Usuário'}
            </span>
            <span className="text-xs text-muted-foreground mt-1">
              {profile?.is_admin ? 'Administrador' : 'Recrutador(a)'}
            </span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

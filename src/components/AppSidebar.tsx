import { Link, useLocation } from 'react-router-dom'
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
import { LayoutDashboard, Users, Briefcase, Settings, Plus, SquareKanban } from 'lucide-react'
import { Button } from '@/components/ui/button'

const navItems = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Quadro Kanban', url: '/', icon: SquareKanban },
  { title: 'Vagas', url: '/vagas', icon: Briefcase },
  { title: 'Candidatos', url: '#', icon: Users },
  { title: 'Configurações', url: '#', icon: Settings },
]

export function AppSidebar() {
  const location = useLocation()

  return (
    <Sidebar className="border-r border-slate-200">
      <SidebarHeader className="h-16 flex items-center justify-center border-b border-slate-100">
        <div className="flex items-center gap-2 px-4 w-full">
          <div className="bg-blue-600 p-1.5 rounded-lg">
            <SquareKanban className="h-5 w-5 text-white" />
          </div>
          <span className="font-bold text-lg text-slate-800 tracking-tight">HireFlow</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="py-4">
          <div className="px-4 mb-6">
            <Button className="w-full justify-start gap-2 shadow-sm" size="sm">
              <Plus className="h-4 w-4" />
              <span>Novo Candidato</span>
            </Button>
          </div>

          <SidebarGroupLabel className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-4">
            Menu Principal
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.url}
                    className="data-[active=true]:bg-blue-50 data-[active=true]:text-blue-700 data-[active=true]:font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
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

      <SidebarFooter className="border-t border-slate-100 p-4">
        <div className="flex items-center gap-3">
          <img
            src="https://img.usecurling.com/ppl/thumbnail?gender=female&seed=1"
            alt="User Avatar"
            className="h-8 w-8 rounded-full ring-2 ring-slate-100"
          />
          <div className="flex flex-col">
            <span className="text-sm font-medium text-slate-800 leading-none">Julia Silva</span>
            <span className="text-xs text-slate-500 mt-1">Recrutadora</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

import { Outlet } from 'react-router-dom'
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/AppSidebar'
import { Input } from '@/components/ui/input'
import { Bell, Search, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'

export default function Layout() {
  const { user, signOut } = useAuth()

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
                  className="pl-9 bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground placeholder:text-primary-foreground/50 focus-visible:ring-secondary h-11"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              {user && (
                <span className="hidden sm:inline-block text-sm text-primary-foreground/90 font-medium">
                  {user.email}
                </span>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="relative text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
              >
                <Bell className="h-5 w-5" />
                <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-secondary rounded-full border border-primary"></span>
              </Button>
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

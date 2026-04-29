import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { Navigate } from 'react-router-dom'
import { usersService, SystemUser } from '@/services/users'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, ShieldAlert, AlertCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { UserList } from './components/UserList'
import { UserDialog } from './components/UserDialog'
import { ResetPasswordDialog } from './components/ResetPasswordDialog'
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
import { Skeleton } from '@/components/ui/skeleton'

export default function UsersPage() {
  const { profile, loading: authLoading } = useAuth()
  const { toast } = useToast()
  const [users, setUsers] = useState<SystemUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [userDialogOpen, setUserDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<SystemUser | undefined>()

  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [userToReset, setUserToReset] = useState<SystemUser | undefined>()

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<SystemUser | undefined>()
  const [isDeleting, setIsDeleting] = useState(false)

  const loadUsers = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await usersService.list()
      setUsers(data)
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar usuários')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!authLoading && profile?.is_admin) {
      loadUsers()
    }
  }, [authLoading, profile])

  if (authLoading) return null
  if (!profile?.is_admin) return <Navigate to="/dashboard" replace />

  const filteredUsers = users.filter(
    (u) =>
      u.nome.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  )

  const handleAdd = () => {
    setEditingUser(undefined)
    setUserDialogOpen(true)
  }

  const handleEdit = (user: SystemUser) => {
    setEditingUser(user)
    setUserDialogOpen(true)
  }

  const handleDelete = async () => {
    if (!userToDelete) return
    setIsDeleting(true)
    try {
      await usersService.delete(userToDelete.id)
      toast({ title: 'Sucesso', description: 'Usuário removido com sucesso.' })
      setDeleteDialogOpen(false)
      loadUsers()
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-5xl animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Administração de Usuários</h1>
          <p className="text-muted-foreground text-sm">Gerencie os acessos ao sistema.</p>
        </div>
        <Button onClick={handleAdd} className="w-full md:w-auto shadow-sm gap-2">
          <Plus className="h-4 w-4" /> Novo Usuário
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou e-mail..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-card shadow-sm"
        />
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center p-12 bg-card rounded-lg border border-border">
          <AlertCircle className="h-10 w-10 text-destructive mb-4" />
          <h3 className="text-lg font-semibold text-foreground">Falha ao carregar</h3>
          <p className="text-muted-foreground text-sm mb-4">{error}</p>
          <Button variant="outline" onClick={loadUsers}>
            Tentar novamente
          </Button>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-card rounded-lg border border-border text-center">
          <ShieldAlert className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-semibold text-foreground">Nenhum usuário encontrado</h3>
          <p className="text-muted-foreground text-sm max-w-md mt-2">
            {search
              ? 'Nenhum resultado para a busca atual.'
              : 'Não há usuários cadastrados além de você.'}
          </p>
        </div>
      ) : (
        <UserList
          users={filteredUsers}
          onEdit={handleEdit}
          onDelete={(u) => {
            setUserToDelete(u)
            setDeleteDialogOpen(true)
          }}
          onReset={(u) => {
            setUserToReset(u)
            setResetDialogOpen(true)
          }}
          currentUserId={profile.id}
        />
      )}

      <UserDialog
        open={userDialogOpen}
        onOpenChange={setUserDialogOpen}
        user={editingUser}
        onSuccess={loadUsers}
      />

      <ResetPasswordDialog
        open={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        user={userToReset}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o usuário <strong>{userToDelete?.nome}</strong>? Esta
              ação não pode ser desfeita e removerá o acesso ao sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Excluindo...' : 'Sim, excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

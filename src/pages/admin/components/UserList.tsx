import { SystemUser } from '@/services/users'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Shield, ShieldCheck, MoreVertical, Pencil, KeyRound, Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase/client'

interface Props {
  users: SystemUser[]
  onEdit: (user: SystemUser) => void
  onDelete: (user: SystemUser) => void
  onReset: (user: SystemUser) => void
  currentUserId: string
}

export function UserList({ users, onEdit, onDelete, onReset, currentUserId }: Props) {
  const getAvatarUrl = (url: string | null | undefined) => {
    if (!url) return ''
    if (url.startsWith('http') || url.startsWith('data:')) return url
    const { data } = supabase.storage.from('avatars').getPublicUrl(url)
    return data.publicUrl
  }

  const getInitials = (name: string | null) => {
    if (!name) return '??'
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
    return '??'
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca'
    return format(new Date(dateStr), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
  }

  const Actions = ({ user }: { user: SystemUser }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => onEdit(user)}>
          <Pencil className="mr-2 h-4 w-4" /> Editar Perfil
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onReset(user)}>
          <KeyRound className="mr-2 h-4 w-4" /> Resetar Senha
        </DropdownMenuItem>
        {user.id !== currentUserId && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(user)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Excluir
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <>
      <div className="md:hidden space-y-4">
        {users.map((user) => (
          <Card key={user.id} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage
                      src={getAvatarUrl(user.avatar_url)}
                      alt={user.nome || 'Avatar'}
                      className="object-cover aspect-square h-full w-full"
                    />
                    <AvatarFallback>{getInitials(user.nome)}</AvatarFallback>
                  </Avatar>
                  <div className="space-y-1">
                    <h4 className="font-medium flex items-center gap-2">
                      {user.nome}
                      {user.is_admin && (
                        <Badge variant="secondary" className="h-5 px-1.5">
                          <ShieldCheck className="h-3 w-3 mr-1 text-primary" /> Admin
                        </Badge>
                      )}
                    </h4>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  </div>
                </div>
                <Actions user={user} />
              </div>
              <div className="mt-4 text-xs text-muted-foreground grid grid-cols-2 gap-2">
                <div>
                  <span className="block font-medium text-foreground/70 mb-0.5">Último acesso</span>
                  {formatDate(user.last_sign_in_at)}
                </div>
                <div>
                  <span className="block font-medium text-foreground/70 mb-0.5">Criado em</span>
                  {formatDate(user.created_at)}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="hidden md:block rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Último Acesso</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarImage
                        src={getAvatarUrl(user.avatar_url)}
                        alt={user.nome || 'Avatar'}
                        className="object-cover aspect-square h-full w-full"
                      />
                      <AvatarFallback>{getInitials(user.nome)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{user.nome}</div>
                      <div className="text-sm text-muted-foreground">{user.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {user.is_admin ? (
                    <Badge variant="secondary" className="font-normal text-xs">
                      <ShieldCheck className="h-3 w-3 mr-1 text-primary" /> Administrador
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="font-normal text-xs text-muted-foreground">
                      <Shield className="h-3 w-3 mr-1" /> Padrão
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(user.last_sign_in_at)}
                </TableCell>
                <TableCell className="text-right">
                  <Actions user={user} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

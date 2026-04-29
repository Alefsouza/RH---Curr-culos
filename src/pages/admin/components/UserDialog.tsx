import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SystemUser, usersService } from '@/services/users'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  user?: SystemUser
  onSuccess: () => void
}

export function UserDialog({ open, onOpenChange, user, onSuccess }: Props) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    password: '',
    is_admin: false,
  })

  useEffect(() => {
    if (open) {
      setFormData({
        nome: user?.nome || '',
        email: user?.email || '',
        password: '',
        is_admin: user?.is_admin || false,
      })
    }
  }, [open, user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (user) {
        await usersService.update({
          id: user.id,
          nome: formData.nome,
          email: formData.email,
          is_admin: formData.is_admin,
        })
        toast({ title: 'Sucesso', description: 'Usuário atualizado com sucesso.' })
      } else {
        if (!formData.password || formData.password.length < 6) {
          throw new Error('A senha deve ter pelo menos 6 caracteres.')
        }
        await usersService.create(formData)
        toast({ title: 'Sucesso', description: 'Usuário criado com sucesso.' })
      }
      onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{user ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
            <DialogDescription>
              {user
                ? 'Atualize as informações do perfil e permissões.'
                : 'Crie um novo acesso preenchendo os dados abaixo.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome completo</Label>
              <Input
                id="nome"
                required
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            {!user && (
              <div className="space-y-2">
                <Label htmlFor="password">Senha de acesso</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg border p-3 mt-2 shadow-sm">
              <div className="space-y-0.5">
                <Label className="text-base">Acesso Administrador</Label>
                <p className="text-sm text-muted-foreground">
                  Permite gerenciar outros usuários e configurações.
                </p>
              </div>
              <Switch
                checked={formData.is_admin}
                onCheckedChange={(checked) => setFormData({ ...formData, is_admin: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

import { useState, useRef } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Camera, Loader2, Save } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth()
  const [nome, setNome] = useState(profile?.nome || '')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setLoading(true)
    try {
      const { error } = await supabase.from('usuarios').update({ nome }).eq('id', user.id)

      if (error) throw error

      await refreshProfile()
      toast.success('Perfil atualizado com sucesso!')
    } catch (error: any) {
      console.error('Erro ao atualizar perfil:', error)
      toast.error('Erro ao atualizar perfil.', {
        description: error.message,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Arquivo muito grande. O tamanho máximo é 2MB.')
      return
    }

    setUploading(true)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${user.id}/avatar-${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true })

      if (uploadError) throw uploadError

      const {
        data: { publicUrl },
      } = supabase.storage.from('avatars').getPublicUrl(fileName)

      const { error: updateError } = await supabase
        .from('usuarios')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id)

      if (updateError) throw updateError

      await refreshProfile()
      toast.success('Foto de perfil atualizada com sucesso!')
    } catch (error: any) {
      console.error('Erro ao atualizar foto:', error)
      toast.error('Erro ao atualizar foto.', {
        description: error.message,
      })
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="container max-w-2xl py-8 animate-fade-in-up">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Meu Perfil</h1>
        <p className="text-muted-foreground mt-1">
          Gerencie suas informações pessoais e foto de perfil.
        </p>
      </div>

      <div className="grid gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Foto de Perfil</CardTitle>
            <CardDescription>Esta foto será exibida no menu lateral.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-6">
            <div className="relative group shrink-0">
              <Avatar className="h-24 w-24 border-2 border-border">
                <AvatarImage src={profile?.avatar_url || ''} className="object-cover" />
                <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                  {profile?.nome?.substring(0, 2).toUpperCase() || 'US'}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed text-white"
              >
                {uploading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <Camera className="h-6 w-6" />
                )}
              </button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/png, image/jpeg, image/jpg, image/webp"
                onChange={handleFileChange}
              />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium mb-1">Atualizar foto</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Recomendado: imagem quadrada (JPG, PNG ou WebP) de até 2MB.
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? 'Enviando...' : 'Escolher arquivo'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Informações Pessoais</CardTitle>
            <CardDescription>Atualize seu nome de exibição no sistema.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={user?.email || ''}
                  readOnly
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  O endereço de e-mail não pode ser alterado por aqui.
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="nome">Nome Completo</Label>
                <Input
                  id="nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Seu nome completo"
                  required
                />
              </div>

              <div className="flex justify-end mt-4">
                <Button type="submit" disabled={loading || !nome.trim() || nome === profile?.nome}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Salvar Alterações
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

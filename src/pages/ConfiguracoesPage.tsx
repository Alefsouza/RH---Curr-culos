import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, Mail, Clock, Shield } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'

export default function ConfiguracoesPage() {
  const [syncing, setSyncing] = useState(false)

  const handleSyncNow = async () => {
    setSyncing(true)
    try {
      const { data, error } = await supabase.functions.invoke('sync-outlook-cvs', { body: {} })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      toast.success(
        `Sincronização concluída: ${data?.cvs_imported || 0} currículo(s) importado(s).`,
      )
    } catch (e: any) {
      toast.error('Erro na sincronização: ' + e.message)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie as integrações e preferências do sistema.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" /> Sincronização de E-mails
          </CardTitle>
          <CardDescription>
            Configurações da importação automática de currículos via Outlook.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg border bg-slate-50">
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Caixa Monitorada</p>
                <p className="text-xs text-muted-foreground">rh@viasudeste.com</p>
              </div>
            </div>
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              Ativo
            </Badge>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border bg-slate-50">
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Frequência</p>
                <p className="text-xs text-muted-foreground">A cada 15 minutos (automático)</p>
              </div>
            </div>
            <Badge variant="outline">15 min</Badge>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border bg-slate-50">
            <div className="flex items-center gap-3">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Domínio Restrito</p>
                <p className="text-xs text-muted-foreground">Apenas @viasudeste.com</p>
              </div>
            </div>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              viasudeste.com
            </Badge>
          </div>
          <div className="pt-2">
            <Button onClick={handleSyncNow} disabled={syncing} className="w-full sm:w-auto">
              {syncing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              {syncing ? 'Sincronizando...' : 'Sincronizar Agora'}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Inicia uma sincronização manual imediata da caixa de entrada.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Filtros de Importação</CardTitle>
          <CardDescription>
            Regras aplicadas automaticamente durante a sincronização.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-lg border">
            <div className="bg-blue-50 p-1.5 rounded mt-0.5">
              <Mail className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium">Filtro de Assunto</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Palavras-chave: currículo, curriculo, curriculum, CV
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg border">
            <div className="bg-orange-50 p-1.5 rounded mt-0.5">
              <Shield className="w-3.5 h-3.5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm font-medium">Remetentes Internos</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Apenas envio@viasudeste.com é permitido para e-mails internos
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg border">
            <div className="bg-red-50 p-1.5 rounded mt-0.5">
              <Clock className="w-3.5 h-3.5 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-medium">Ignorar Respostas</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                E-mails com RE:, FWD:, RES:, ENC: são ignorados
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { RefreshCw, CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const statusConfig: Record<string, any> = {
  running: {
    label: 'Em execução',
    icon: Loader2,
    color: 'bg-blue-100 text-blue-800',
    animate: true,
  },
  success: { label: 'Sucesso', icon: CheckCircle, color: 'bg-green-100 text-green-800' },
  error: { label: 'Erro', icon: XCircle, color: 'bg-red-100 text-red-800' },
  partial: { label: 'Parcial', icon: AlertTriangle, color: 'bg-yellow-100 text-yellow-800' },
}

const formatDate = (d: string) =>
  new Date(d).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

export default function SincronizacaoPage() {
  const [runs, setRuns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('sync_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(30)
      if (error) throw error
      setRuns(data || [])
    } catch (e: any) {
      toast.error('Erro: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const { data, error } = await supabase.functions.invoke('sync-outlook-cvs', { body: {} })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      toast.success(`${data?.cvs_imported || 0} currículo(s) importado(s).`)
      load()
    } catch (e: any) {
      toast.error('Erro: ' + e.message)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sincronização Outlook</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Importação automática de currículos — rh@viasudeste.com
          </p>
        </div>
        <Button onClick={handleSync} disabled={syncing}>
          {syncing ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          {syncing ? 'Sincronizando...' : 'Sincronizar Agora'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de Sincronizações</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : runs.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">
              Nenhuma sincronização registrada.
            </p>
          ) : (
            <div className="space-y-3">
              {runs.map((run) => {
                const cfg = statusConfig[run.status] || statusConfig.running
                const Icon = cfg.icon
                return (
                  <div
                    key={run.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn('p-2 rounded-full', cfg.color)}>
                        <Icon className={cn('w-4 h-4', cfg.animate && 'animate-spin')} />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{formatDate(run.started_at)}</p>
                        <p className="text-xs text-muted-foreground">
                          {run.finished_at ? formatDate(run.finished_at) : 'Em andamento...'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-center">
                        <b className="block text-slate-700">{run.emails_scanned || 0}</b>
                        <span className="text-muted-foreground">Scaneados</span>
                      </span>
                      <span className="text-center">
                        <b className="block text-green-600">{run.cvs_imported || 0}</b>
                        <span className="text-muted-foreground">Importados</span>
                      </span>
                      <span className="text-center">
                        <b className="block text-yellow-600">{run.cvs_skipped_duplicate || 0}</b>
                        <span className="text-muted-foreground">Duplicados</span>
                      </span>
                      <Badge className={cfg.color}>{cfg.label}</Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {!loading && runs.some((r) => r.errors) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Erros Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {runs
                .filter((r) => r.errors)
                .flatMap((r) =>
                  (Array.isArray(r.errors) ? r.errors : []).map((err: any, i: number) => (
                    <div
                      key={`${r.id}-${i}`}
                      className="p-3 rounded-md bg-red-50 border border-red-100 text-sm"
                    >
                      <p className="font-medium text-red-800">{err.messageId || 'N/A'}</p>
                      <p className="text-red-600 mt-1">{err.error}</p>
                    </div>
                  )),
                )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { CheckCircle2, XCircle, Loader2, Sparkles, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export type CandidateProcessStatus = 'pending' | 'processing' | 'success' | 'error'

export interface BulkCandidateItem {
  id: string
  nome: string
  vaga?: string
  status: CandidateProcessStatus
  error?: string
  resultado?: string
}

interface BulkProgressDialogProps {
  isOpen: boolean
  title?: string
  items: BulkCandidateItem[]
  currentBatch: number
  totalBatches: number
  batchSize: number
  isRunning: boolean
  onClose: () => void
}

export function BulkProgressDialog({
  isOpen,
  title = 'Reanálise de Candidatos com IA',
  items,
  currentBatch,
  totalBatches,
  batchSize,
  isRunning,
  onClose,
}: BulkProgressDialogProps) {
  const total = items.length
  const completedCount = items.filter((i) => i.status === 'success' || i.status === 'error').length
  const successCount = items.filter((i) => i.status === 'success').length
  const errorCount = items.filter((i) => i.status === 'error').length
  const progressPercent = total > 0 ? Math.round((completedCount / total) * 100) : 0

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isRunning && onClose()}>
      <DialogContent className="sm:max-w-[620px] max-h-[90vh] flex flex-col p-6">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
              <p className="text-xs text-slate-500">
                Processamento controlado em lotes de {batchSize} por vez para evitar sobrecarga.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 my-2">
          {/* Progress Overview Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-800 flex items-center gap-2">
                {isRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    Processando lote {currentBatch} de {totalBatches}...
                  </>
                ) : (
                  'Processamento finalizado'
                )}
              </span>
              <span className="text-sm font-bold text-slate-700">
                {completedCount} / {total} ({progressPercent}%)
              </span>
            </div>

            <Progress value={progressPercent} className="h-3 w-full bg-slate-200" />

            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              <div className="bg-white rounded-lg p-2 border border-slate-100 shadow-sm">
                <span className="block text-xs text-slate-500">Concluídos</span>
                <span className="text-base font-bold text-slate-800">{completedCount}</span>
              </div>
              <div className="bg-white rounded-lg p-2 border border-green-100 shadow-sm">
                <span className="block text-xs text-green-600 font-medium">Sucesso</span>
                <span className="text-base font-bold text-green-600">{successCount}</span>
              </div>
              <div className="bg-white rounded-lg p-2 border border-red-100 shadow-sm">
                <span className="block text-xs text-red-600 font-medium">Falhas</span>
                <span className="text-base font-bold text-red-600">{errorCount}</span>
              </div>
            </div>
          </div>

          {/* Individual items list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Status dos candidatos ({total})
              </span>
              {isRunning && (
                <span className="text-xs text-slate-400">
                  Aguardando resposta das Edge Functions...
                </span>
              )}
            </div>

            <ScrollArea className="h-[240px] rounded-xl border border-slate-200 bg-white shadow-inner p-2">
              <div className="space-y-1.5 p-1">
                {items.map((item, idx) => {
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        'flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors',
                        item.status === 'processing' &&
                          'bg-blue-50/70 border-blue-200 text-blue-900',
                        item.status === 'success' &&
                          'bg-emerald-50/50 border-emerald-200 text-slate-900',
                        item.status === 'error' && 'bg-red-50/50 border-red-200 text-slate-900',
                        item.status === 'pending' &&
                          'bg-slate-50/60 border-slate-100 text-slate-500',
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <span className="text-xs font-mono text-slate-400 w-6 shrink-0">
                          #{idx + 1}
                        </span>

                        <div className="min-w-0">
                          <p className="font-medium truncate text-xs sm:text-sm">{item.nome}</p>
                          {item.vaga && (
                            <p className="text-[11px] text-slate-400 truncate">{item.vaga}</p>
                          )}
                          {item.error && (
                            <p className="text-[11px] text-red-600 truncate mt-0.5">{item.error}</p>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-1.5 pl-2">
                        {item.status === 'pending' && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
                            Na fila
                          </span>
                        )}

                        {item.status === 'processing' && (
                          <span className="inline-flex items-center gap-1.5 text-[11px] text-blue-600 bg-blue-100 px-2.5 py-0.5 rounded-full font-medium">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Analisando...
                          </span>
                        )}

                        {item.status === 'success' && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            {item.resultado ? item.resultado.toUpperCase() : 'Concluído'}
                          </span>
                        )}

                        {item.status === 'error' && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-red-700 bg-red-100 px-2 py-0.5 rounded-full font-medium">
                            <XCircle className="h-3.5 w-3.5 text-red-600" />
                            Falha
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </div>

          {!isRunning && errorCount > 0 && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              <span>
                {errorCount} candidato(s) não puderam ser reanalisados devido a erros de validação
                ou indisponibilidade temporária.
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="mt-2 sm:justify-between items-center gap-2 border-t pt-4">
          <div className="text-xs text-slate-500">
            {isRunning
              ? 'Por favor, não feche a aba enquanto o processamento estiver em andamento.'
              : 'Reanálise finalizada.'}
          </div>
          <Button onClick={onClose} disabled={isRunning} variant={isRunning ? 'ghost' : 'default'}>
            {isRunning ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Em andamento...
              </span>
            ) : (
              'Fechar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  Clock,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  HardDrive,
} from 'lucide-react'
import type { RecoverCandidatesResumo } from '@/services/candidates'

interface RecoverCandidatesResultDialogProps {
  isOpen: boolean
  onClose: () => void
  resumo: RecoverCandidatesResumo | null
}

export function RecoverCandidatesResultDialog({
  isOpen,
  onClose,
  resumo,
}: RecoverCandidatesResultDialogProps) {
  const [showFailures, setShowFailures] = useState(false)

  if (!resumo) return null

  const hasFailures =
    resumo.falhas > 0 || (resumo.detalhes_falhas && resumo.detalhes_falhas.length > 0)
  const failureList = resumo.detalhes_falhas || []

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <HardDrive className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>Recuperação de Currículos Concluída</DialogTitle>
              <DialogDescription className="mt-1">
                Varredura do bucket finalizada e base de dados atualizada.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Métricas do resumo */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 text-center">
              <span className="text-xs text-slate-500 font-medium block">PDFs no Bucket</span>
              <span className="text-lg font-bold text-slate-900 mt-0.5 block">
                {resumo.total_pdfs_encontrados}
              </span>
            </div>

            <div className="bg-emerald-50 border border-emerald-200/70 rounded-lg p-3 text-center">
              <span className="text-xs text-emerald-700 font-medium block">Recuperados</span>
              <span className="text-lg font-bold text-emerald-700 mt-0.5 block">
                {resumo.sucesso}
              </span>
            </div>

            <div className="bg-blue-50 border border-blue-200/70 rounded-lg p-3 text-center">
              <span className="text-xs text-blue-700 font-medium block">Já Existentes</span>
              <span className="text-lg font-bold text-blue-700 mt-0.5 block">
                {resumo.pulados_existentes}
              </span>
            </div>

            <div
              className={`rounded-lg p-3 text-center border ${
                resumo.falhas > 0
                  ? 'bg-red-50 border-red-200/70 text-red-700'
                  : 'bg-slate-50 border-slate-200/80 text-slate-700'
              }`}
            >
              <span className="text-xs font-medium block">Falhas</span>
              <span className="text-lg font-bold mt-0.5 block">{resumo.falhas}</span>
            </div>
          </div>

          {/* Duração */}
          {typeof resumo.tempo_total_segundos === 'number' && (
            <div className="flex items-center gap-2 text-xs text-slate-500 px-1">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              <span>
                Tempo total de execução: <strong>{resumo.tempo_total_segundos.toFixed(1)}s</strong>
              </span>
            </div>
          )}

          {/* Collapsible com detalhes de falhas se houver */}
          {hasFailures && (
            <Collapsible
              open={showFailures}
              onOpenChange={setShowFailures}
              className="border border-red-200 bg-red-50/40 rounded-lg p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-red-800">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span>Ver detalhes das {failureList.length || resumo.falhas} falha(s)</span>
                </div>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-red-700 hover:text-red-900 hover:bg-red-100/60 gap-1 px-2"
                  >
                    {showFailures ? 'Ocultar' : 'Expandir'}
                    {showFailures ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </CollapsibleTrigger>
              </div>

              <CollapsibleContent className="pt-2">
                <ScrollArea className="max-h-[160px] rounded border border-red-200 bg-white p-2">
                  {failureList.length > 0 ? (
                    <div className="space-y-2">
                      {failureList.map((fail, idx) => (
                        <div
                          key={idx}
                          className="text-xs border-b border-slate-100 last:border-b-0 pb-1.5 last:pb-0"
                        >
                          <p className="font-medium text-slate-800 break-all">
                            {fail.arquivo || `Item #${idx + 1}`}
                          </p>
                          {fail.erro && (
                            <p className="text-red-600 text-[11px] mt-0.5">{fail.erro}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 py-2 text-center">
                      Nenhum detalhe adicional fornecido pelo servidor.
                    </p>
                  )}
                </ScrollArea>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Mensagem de sucesso quando 0 falhas */}
          {!hasFailures && (
            <div className="flex items-center gap-2.5 p-3 rounded-lg bg-emerald-50 border border-emerald-200/60 text-emerald-800 text-xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>
                Todos os currículos do bucket foram processados ou já estavam indexados com sucesso!
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose} className="w-full sm:w-auto">
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

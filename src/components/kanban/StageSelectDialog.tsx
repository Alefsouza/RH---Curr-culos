import { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, Columns, Check, ArrowRight } from 'lucide-react'
import { Stage } from '@/types/kanban'
import { cn } from '@/lib/utils'

interface StageSelectDialogProps {
  isOpen: boolean
  stages: Stage[]
  currentStageId?: string
  candidateCount: number
  mode?: 'all' | 'selected'
  onClose: () => void
  onConfirm: (targetStageId: string) => void
}

export function StageSelectDialog({
  isOpen,
  stages,
  currentStageId,
  candidateCount,
  mode = 'all',
  onClose,
  onConfirm,
}: StageSelectDialogProps) {
  const [search, setSearch] = useState('')
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null)

  // Filtra as etapas excluindo a etapa de origem atual (não faz sentido mover para a mesma etapa)
  const availableStages = useMemo(() => {
    return [...stages].sort((a, b) => a.order - b.order).filter((s) => s.id !== currentStageId)
  }, [stages, currentStageId])

  useEffect(() => {
    if (isOpen) {
      setSearch('')
      // Pre-seleciona a primeira etapa disponível se existir
      if (availableStages.length > 0) {
        setSelectedStageId(availableStages[0].id)
      } else {
        setSelectedStageId(null)
      }
    }
  }, [isOpen, availableStages])

  const filteredStages = useMemo(() => {
    if (!search.trim()) return availableStages
    const query = search.toLowerCase().trim()
    return availableStages.filter((s) => s.name.toLowerCase().includes(query))
  }, [availableStages, search])

  const handleConfirm = () => {
    if (!selectedStageId) return
    onConfirm(selectedStageId)
  }

  const selectedStage = stages.find((s) => s.id === selectedStageId)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Columns className="h-5 w-5 text-primary" />
            Mover {mode === 'all' ? 'todos os candidatos' : 'candidatos selecionados'}
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            {candidateCount === 1
              ? `Escolha a etapa do Kanban de destino para o candidato.`
              : `Escolha a etapa do Kanban de destino para os ${candidateCount} candidatos.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {availableStages.length > 5 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar etapa..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-10"
              />
            </div>
          )}

          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 px-1">
            Etapas disponíveis ({filteredStages.length})
          </div>

          <ScrollArea className="max-h-[280px] rounded-lg border border-slate-200 bg-slate-50/50">
            <div className="p-2 space-y-1.5">
              {filteredStages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Columns className="h-8 w-8 text-slate-300 mb-2" />
                  <p className="text-sm text-slate-400">Nenhuma etapa disponível encontrada.</p>
                </div>
              ) : (
                filteredStages.map((st, index) => {
                  const isSelected = selectedStageId === st.id
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setSelectedStageId(st.id)}
                      className={cn(
                        'w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-lg text-left text-sm font-medium transition-all border',
                        isSelected
                          ? 'bg-primary text-white border-primary shadow-sm'
                          : 'bg-white hover:bg-slate-100/80 text-slate-700 border-slate-200/80',
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={cn(
                            'flex items-center justify-center h-5 w-5 rounded-full text-xs font-semibold shrink-0',
                            isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600',
                          )}
                        >
                          {index + 1}
                        </span>
                        <div
                          className={cn(
                            'w-2.5 h-2.5 rounded-full shrink-0',
                            st.color || 'bg-slate-300',
                          )}
                        />
                        <span className="truncate font-semibold">{st.name}</span>
                      </div>

                      {isSelected && (
                        <div className="flex items-center gap-1 shrink-0 text-white font-medium text-xs">
                          <Check className="h-4 w-4" />
                        </div>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedStageId || availableStages.length === 0}
            className="gap-1.5"
          >
            <span>Mover para {selectedStage ? `"${selectedStage.name}"` : 'Etapa'}</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

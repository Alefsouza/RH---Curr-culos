import React, { useState } from 'react'
import { Candidate, Stage } from '@/types/kanban'
import { KanbanCard } from '@/components/kanban/KanbanCard'
import { Button } from '@/components/ui/button'
import { ArrowRight, GripHorizontal, Loader2, MoreHorizontal, Plus } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase/client'

interface KanbanColumnProps {
  stage: Stage
  candidates: Candidate[]
  draggedCandidateId: string | null
  onDrop: (candidateId: string, stageId: string) => Promise<void> | void
  onDragStart: (id: string) => void
  onDragEnd: () => void
  nextStage?: Stage | null
  selectedCandidateIds?: Set<string>
  onToggleSelectCandidate?: (candidateId: string) => void
  onClearSelectedCandidates?: (candidateIdsToClear?: string[]) => void
  draggedStageId?: string | null
  onStageDragStart?: (stageId: string) => void
  onStageDragEnd?: () => void
  onStageDrop?: (sourceStageId: string, targetStageId: string) => void
}

export function KanbanColumn({
  stage,
  candidates,
  draggedCandidateId,
  onDrop,
  onDragStart,
  onDragEnd,
  nextStage,
  selectedCandidateIds = new Set(),
  onToggleSelectCandidate,
  onClearSelectedCandidates,
  draggedStageId,
  onStageDragStart,
  onStageDragEnd,
  onStageDrop,
}: KanbanColumnProps) {
  const [isCardDragOver, setIsCardDragOver] = useState(false)
  const [isColumnDragOver, setIsColumnDragOver] = useState(false)
  const [isAlertOpen, setIsAlertOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [newStageName, setNewStageName] = useState(stage.name)
  const [isSaving, setIsSaving] = useState(false)
  const [isMovingAll, setIsMovingAll] = useState(false)
  const [isMovingSelected, setIsMovingSelected] = useState(false)
  const [movingProgress, setMovingProgress] = useState<{ current: number; total: number } | null>(
    null,
  )
  const { toast } = useToast()

  const isCurrentStageDragging = draggedStageId === stage.id

  // --- Handlers para arrastar cabeçalho/coluna ---
  const handleHeaderDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/x-kanban-stage', stage.id)
    e.dataTransfer.setData('text/plain', stage.id)
    e.dataTransfer.effectAllowed = 'move'
    onStageDragStart?.(stage.id)
  }

  const handleHeaderDragEnd = () => {
    onStageDragEnd?.()
  }

  const handleColumnDragOver = (e: React.DragEvent) => {
    // Se estamos arrastando uma etapa/coluna
    if (e.dataTransfer.types.includes('application/x-kanban-stage') || draggedStageId) {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      if (!isColumnDragOver && draggedStageId !== stage.id) {
        setIsColumnDragOver(true)
      }
    }
  }

  const handleColumnDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return
    }
    setIsColumnDragOver(false)
  }

  const handleColumnDrop = (e: React.DragEvent) => {
    const stageData = e.dataTransfer.getData('application/x-kanban-stage')
    if (stageData || draggedStageId) {
      e.preventDefault()
      e.stopPropagation()
      setIsColumnDragOver(false)
      const sourceStageId = stageData || draggedStageId
      if (sourceStageId && sourceStageId !== stage.id) {
        onStageDrop?.(sourceStageId, stage.id)
      }
    }
  }

  // --- Handlers para arrastar cards de candidatos ---
  const handleCardAreaDragOver = (e: React.DragEvent) => {
    // Se estamos arrastando candidato (não etapa)
    if (!e.dataTransfer.types.includes('application/x-kanban-stage') && !draggedStageId) {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      setIsCardDragOver(true)
    }
  }

  const handleCardAreaDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsCardDragOver(false)
  }

  const handleCardAreaDrop = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-kanban-stage') || draggedStageId) {
      handleColumnDrop(e)
      return
    }

    e.preventDefault()
    e.stopPropagation()
    setIsCardDragOver(false)
    const candidateId = e.dataTransfer.getData('text/plain')

    // Verifica se o ID extraído é um UUID válido antes de disparar a requisição
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    if (candidateId && uuidRegex.test(candidateId.trim())) {
      onDrop(candidateId.trim(), stage.id)
    }
  }

  const handleEditClick = (e: React.MouseEvent) => {
    e.preventDefault()
    setNewStageName(stage.name)
    setIsEditDialogOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!newStageName.trim() || newStageName.trim() === stage.name) {
      setIsEditDialogOpen(false)
      return
    }
    try {
      setIsSaving(true)
      const { error } = await supabase
        .from('etapas')
        .update({ nome: newStageName.trim() })
        .eq('id', stage.id)

      if (error) throw error

      toast({
        title: 'Etapa renomeada com sucesso',
      })

      window.dispatchEvent(new CustomEvent('kanban:reload'))
      setIsEditDialogOpen(false)
    } catch (err: any) {
      toast({
        title: 'Erro ao renomear etapa',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteClick = async (e: React.MouseEvent) => {
    e.preventDefault()

    if (candidates.length > 0) {
      toast({
        title:
          'Não é possível deletar. Existem currículos nesta etapa. Mova-os para outra etapa primeiro.',
        variant: 'destructive',
      })
      return
    }

    try {
      const { count, error } = await supabase
        .from('candidatos')
        .select('*', { count: 'exact', head: true })
        .eq('etapa_id', stage.id)

      if (error) throw error

      if (count && count > 0) {
        toast({
          title:
            'Não é possível deletar. Existem currículos nesta etapa. Mova-os para outra etapa primeiro.',
          variant: 'destructive',
        })
        return
      }

      setIsAlertOpen(true)
    } catch (err: any) {
      toast({
        title: 'Erro ao verificar a etapa',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  const handleConfirmDelete = async () => {
    try {
      setIsDeleting(true)
      const { error } = await supabase.from('etapas').delete().eq('id', stage.id)
      if (error) throw error

      toast({
        title: 'Etapa deletada com sucesso',
      })

      window.dispatchEvent(
        new CustomEvent('kanban:delete-stage', { detail: { stageId: stage.id } }),
      )
    } catch (err: any) {
      toast({
        title: 'Erro ao deletar etapa',
        description: err.message,
        variant: 'destructive',
      })
    } finally {
      setIsDeleting(false)
      setIsAlertOpen(false)
    }
  }

  const selectedCandidatesInStage = candidates.filter((c) => selectedCandidateIds.has(c.id))

  const handleMoveAll = async () => {
    if (!nextStage || candidates.length === 0 || isMovingAll || isMovingSelected) return

    const total = candidates.length
    setIsMovingAll(true)
    setMovingProgress({ current: 0, total })

    try {
      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i]
        setMovingProgress({ current: i + 1, total })
        await onDrop(candidate.id, nextStage.id)
      }

      toast({
        title: `Sucesso!`,
        description: `${total} candidato(s) movido(s) para "${nextStage.name}".`,
      })
      onClearSelectedCandidates?.(candidates.map((c) => c.id))
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao mover candidatos',
        description: err?.message || 'Ocorreu um erro ao transferir todos os candidatos.',
      })
    } finally {
      setIsMovingAll(false)
      setMovingProgress(null)
    }
  }

  const handleMoveSelected = async () => {
    if (!nextStage || selectedCandidatesInStage.length < 2 || isMovingSelected || isMovingAll)
      return

    const total = selectedCandidatesInStage.length
    setIsMovingSelected(true)
    setMovingProgress({ current: 0, total })

    try {
      for (let i = 0; i < selectedCandidatesInStage.length; i++) {
        const candidate = selectedCandidatesInStage[i]
        setMovingProgress({ current: i + 1, total })
        await onDrop(candidate.id, nextStage.id)
      }

      toast({
        title: `Sucesso!`,
        description: `${total} candidato(s) selecionado(s) movido(s) para "${nextStage.name}".`,
      })
      onClearSelectedCandidates?.(selectedCandidatesInStage.map((c) => c.id))
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao mover candidatos selecionados',
        description: err?.message || 'Ocorreu um erro ao transferir os candidatos selecionados.',
      })
    } finally {
      setIsMovingSelected(false)
      setMovingProgress(null)
    }
  }

  return (
    <>
      <div
        onDragOver={handleColumnDragOver}
        onDragLeave={handleColumnDragLeave}
        onDrop={handleColumnDrop}
        className={cn(
          'group flex flex-col flex-shrink-0 w-full md:w-[320px] min-h-[650px] bg-slate-50/50 rounded-xl border transition-all shadow-sm overflow-hidden h-full relative',
          isCurrentStageDragging
            ? 'opacity-40 border-dashed border-primary/50 bg-slate-100 scale-[0.98]'
            : 'border-transparent hover:border-primary/40',
          isColumnDragOver &&
            'ring-2 ring-primary ring-offset-2 bg-primary/5 border-primary shadow-md',
        )}
      >
        {isColumnDragOver && (
          <div className="absolute inset-0 z-30 bg-primary/10 backdrop-blur-[1px] border-2 border-dashed border-primary rounded-xl flex items-center justify-center pointer-events-none">
            <span className="px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-md shadow-sm">
              Soltar coluna aqui
            </span>
          </div>
        )}

        <div className="flex flex-col border-b border-transparent group-hover:border-primary/20 hover:border-primary/20 transition-colors bg-white/50 backdrop-blur-sm shrink-0">
          <div
            draggable
            onDragStart={handleHeaderDragStart}
            onDragEnd={handleHeaderDragEnd}
            className="flex items-center justify-between p-3 pb-2 cursor-grab active:cursor-grabbing hover:bg-slate-100/70 select-none transition-colors rounded-t-xl"
            title="Arraste pelo cabeçalho para reordenar esta etapa"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <GripHorizontal className="h-4 w-4 text-slate-400 group-hover:text-primary transition-colors shrink-0" />
              <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', stage.color)} />
              <h3 className="font-semibold text-slate-700 text-sm truncate" title={stage.name}>
                {stage.name}
              </h3>
              <span className="flex items-center justify-center bg-slate-100 text-slate-600 text-xs font-medium rounded-full h-5 px-2 shrink-0">
                {candidates.length}
              </span>
            </div>
            <div
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0"
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-400 hover:text-slate-600 shrink-0"
                  >
                    <MoreHorizontal size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={handleEditClick}>Editar Etapa</DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleDeleteClick}
                    className="text-red-600 focus:bg-red-50 focus:text-red-700"
                  >
                    Deletar Etapa
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {nextStage && (
            <div className="px-3 pb-2.5 pt-0.5 space-y-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={handleMoveAll}
                disabled={candidates.length === 0 || isMovingAll || isMovingSelected}
                className="w-full h-8 text-xs font-medium text-slate-600 hover:text-primary hover:border-primary/40 bg-white shadow-none transition-all flex items-center justify-center gap-1.5"
                title={`Mover todos os ${candidates.length} candidatos visíveis para ${nextStage.name}`}
              >
                {isMovingAll ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    <span>
                      Movendo {movingProgress?.current || 0}/
                      {movingProgress?.total || candidates.length}...
                    </span>
                  </>
                ) : (
                  <>
                    <span>Mover todos ({candidates.length})</span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                  </>
                )}
              </Button>

              {selectedCandidatesInStage.length > 1 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleMoveSelected}
                  disabled={isMovingSelected || isMovingAll}
                  className="w-full h-8 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 shadow-none transition-all flex items-center justify-center gap-1.5"
                  title={`Mover os ${selectedCandidatesInStage.length} candidatos selecionados para ${nextStage.name}`}
                >
                  {isMovingSelected ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      <span>
                        Movendo {movingProgress?.current || 0}/
                        {movingProgress?.total || selectedCandidatesInStage.length}...
                      </span>
                    </>
                  ) : (
                    <>
                      <span>Mover selecionados ({selectedCandidatesInStage.length})</span>
                      <ArrowRight className="h-3.5 w-3.5 text-primary" />
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>

        <div
          className={cn(
            'flex-1 min-h-0 overflow-y-auto p-3 space-y-3 transition-colors duration-200',
            isCardDragOver &&
              'bg-blue-50/50 outline-dashed outline-2 outline-blue-200 outline-offset-[-4px] rounded-b-xl',
          )}
          onDragOver={handleCardAreaDragOver}
          onDragLeave={handleCardAreaDragLeave}
          onDrop={handleCardAreaDrop}
        >
          {candidates.map((candidate) => (
            <KanbanCard
              key={candidate.id}
              candidate={candidate}
              isSelected={selectedCandidateIds.has(candidate.id)}
              onToggleSelect={onToggleSelectCandidate}
              isDragging={draggedCandidateId === candidate.id}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))}

          {candidates.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center border-2 border-dashed border-slate-200 rounded-lg bg-slate-50/50">
              <div className="bg-slate-100 p-3 rounded-full mb-3">
                <Plus className="h-5 w-5 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-500">Nenhum candidato</p>
              <p className="text-xs text-slate-400 mt-1">Arraste para cá</p>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Atenção</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja deletar esta etapa? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleConfirmDelete()
              }}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? 'Deletando...' : 'Deletar Etapa'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Etapa</DialogTitle>
            <DialogDescription>Altere o nome da etapa abaixo.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <input
              type="text"
              value={newStageName}
              onChange={(e) => setNewStageName(e.target.value)}
              className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Nome da etapa"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSaving}>
              {isSaving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

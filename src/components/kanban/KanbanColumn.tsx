import React, { useState } from 'react'
import { Candidate, Stage } from '@/types/kanban'
import { KanbanCard } from '@/components/kanban/KanbanCard'
import { Button } from '@/components/ui/button'
import { MoreHorizontal, Plus } from 'lucide-react'
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
  onDrop: (candidateId: string, stageId: string) => void
  onDragStart: (id: string) => void
  onDragEnd: () => void
}

export function KanbanColumn({
  stage,
  candidates,
  draggedCandidateId,
  onDrop,
  onDragStart,
  onDragEnd,
}: KanbanColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [isAlertOpen, setIsAlertOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [newStageName, setNewStageName] = useState(stage.name)
  const [isSaving, setIsSaving] = useState(false)
  const { toast } = useToast()

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const candidateId = e.dataTransfer.getData('text/plain')
    if (candidateId) {
      onDrop(candidateId, stage.id)
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

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault()
    if (candidates.length > 0) {
      toast({
        title:
          'Não é possível deletar. Existem currículos nesta etapa. Mova-os para outra etapa primeiro.',
        variant: 'destructive',
      })
    } else {
      setIsAlertOpen(true)
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

  return (
    <>
      <div className="flex flex-col flex-shrink-0 w-full md:w-[320px] bg-slate-50/50 rounded-xl border border-slate-200/60 shadow-sm overflow-hidden h-full max-h-full">
        <div className="flex items-center justify-between p-4 border-b border-slate-200/60 bg-white/50 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className={cn('w-2.5 h-2.5 rounded-full', stage.color)} />
            <h3 className="font-semibold text-slate-700 text-sm">{stage.name}</h3>
            <span className="flex items-center justify-center bg-slate-100 text-slate-600 text-xs font-medium rounded-full h-5 px-2 ml-1">
              {candidates.length}
            </span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400 hover:text-slate-600"
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

        <div
          className={cn(
            'flex-1 overflow-y-auto p-3 space-y-3 transition-colors duration-200',
            isDragOver &&
              'bg-blue-50/50 outline-dashed outline-2 outline-blue-200 outline-offset-[-4px] rounded-b-xl',
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {candidates.map((candidate) => (
            <KanbanCard
              key={candidate.id}
              candidate={candidate}
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

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
import { cn } from '@/lib/utils'

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

  return (
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
            <DropdownMenuItem>Editar Etapa</DropdownMenuItem>
            <DropdownMenuItem className="text-red-600 focus:bg-red-50 focus:text-red-700">
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
  )
}

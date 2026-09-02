import React, { useState } from 'react'
import { Candidate, Stage } from '@/types/kanban'
import { KanbanColumn } from '@/components/kanban/KanbanColumn'

interface KanbanBoardProps {
  stages: Stage[]
  candidates: Candidate[]
  draggedCandidateId: string | null
  onDropCandidate: (candidateId: string, newStageId: string) => Promise<void> | void
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onDropStage?: (sourceStageId: string, targetStageId: string) => Promise<void> | void
}

export function KanbanBoard({
  stages,
  candidates,
  draggedCandidateId,
  onDropCandidate,
  onDragStart,
  onDragEnd,
  onDropStage,
}: KanbanBoardProps) {
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set())
  const [draggedStageId, setDraggedStageId] = useState<string | null>(null)
  const sortedStages = [...stages].sort((a, b) => a.order - b.order)

  const handleStageDragStart = (stageId: string) => {
    setDraggedStageId(stageId)
  }

  const handleStageDragEnd = () => {
    setDraggedStageId(null)
  }

  const handleStageDrop = (sourceStageId: string, targetStageId: string) => {
    setDraggedStageId(null)
    onDropStage?.(sourceStageId, targetStageId)
  }

  const handleToggleSelectCandidate = (candidateId: string) => {
    setSelectedCandidateIds((prev) => {
      const next = new Set(prev)
      if (next.has(candidateId)) {
        next.delete(candidateId)
      } else {
        next.add(candidateId)
      }
      return next
    })
  }

  const handleClearSelectedCandidates = (candidateIdsToClear?: string[]) => {
    if (!candidateIdsToClear) {
      setSelectedCandidateIds(new Set())
      return
    }
    setSelectedCandidateIds((prev) => {
      const next = new Set(prev)
      candidateIdsToClear.forEach((id) => next.delete(id))
      return next
    })
  }

  return (
    <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto pb-4 h-full">
      <div className="flex flex-col md:flex-row gap-6 min-h-[600px] items-stretch min-w-max px-1">
        {sortedStages.map((stage, index) => {
          const stageCandidates = candidates
            .filter((c) => c.stageId === stage.id)
            .sort((a, b) => {
              const dateA = new Date(a.criado_em || a.appliedAt || 0).getTime()
              const dateB = new Date(b.criado_em || b.appliedAt || 0).getTime()
              return dateB - dateA
            })
          const nextStage = index < sortedStages.length - 1 ? sortedStages[index + 1] : null

          return (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              candidates={stageCandidates}
              draggedCandidateId={draggedCandidateId}
              onDrop={onDropCandidate}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              nextStage={nextStage}
              selectedCandidateIds={selectedCandidateIds}
              onToggleSelectCandidate={handleToggleSelectCandidate}
              onClearSelectedCandidates={handleClearSelectedCandidates}
              draggedStageId={draggedStageId}
              onStageDragStart={handleStageDragStart}
              onStageDragEnd={handleStageDragEnd}
              onStageDrop={handleStageDrop}
            />
          )
        })}
      </div>
    </div>
  )
}

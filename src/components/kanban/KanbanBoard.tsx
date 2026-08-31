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
}

export function KanbanBoard({
  stages,
  candidates,
  draggedCandidateId,
  onDropCandidate,
  onDragStart,
  onDragEnd,
}: KanbanBoardProps) {
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set())
  const sortedStages = [...stages].sort((a, b) => a.order - b.order)

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
          const stageCandidates = candidates.filter((c) => c.stageId === stage.id)
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
            />
          )
        })}
      </div>
    </div>
  )
}

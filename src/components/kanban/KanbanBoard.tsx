import { Candidate, Stage } from '@/types/kanban'
import { KanbanColumn } from '@/components/kanban/KanbanColumn'

interface KanbanBoardProps {
  stages: Stage[]
  candidates: Candidate[]
  draggedCandidateId: string | null
  onDropCandidate: (candidateId: string, newStageId: string) => void
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
  const sortedStages = [...stages].sort((a, b) => a.order - b.order)

  return (
    <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto pb-2 h-full">
      <div className="flex flex-col md:flex-row gap-6 min-h-full items-stretch min-w-max px-1">
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
            />
          )
        })}
      </div>
    </div>
  )
}

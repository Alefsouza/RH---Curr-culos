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
  return (
    <div className="flex-1 overflow-x-auto pb-4 h-[calc(100vh-14rem)] md:h-[calc(100vh-12rem)]">
      <div className="flex flex-col md:flex-row gap-6 h-full items-stretch min-w-max px-1">
        {stages
          .sort((a, b) => a.order - b.order)
          .map((stage) => {
            const stageCandidates = candidates.filter((c) => c.stageId === stage.id)

            return (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                candidates={stageCandidates}
                draggedCandidateId={draggedCandidateId}
                onDrop={onDropCandidate}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
              />
            )
          })}
      </div>
    </div>
  )
}

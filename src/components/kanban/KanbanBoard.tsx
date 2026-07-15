import { useMemo } from 'react'
import { Candidate, Stage } from '@/types/kanban'
import { KanbanColumn } from '@/components/kanban/KanbanColumn'
import { VagaSelectDialog } from '@/components/candidates/VagaSelectDialog'

interface KanbanBoardProps {
  stages: Stage[]
  candidates: Candidate[]
  draggedCandidateId: string | null
  recentlyDroppedId: string | null
  pendingVagaCandidateId: string | null
  vagas: { id: string; titulo: string }[]
  onDropCandidate: (candidateId: string, newStageId: string) => void
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onConfirmVaga: (vagaId: string) => void
  onCancelVaga: () => void
}

export function KanbanBoard({
  stages,
  candidates,
  draggedCandidateId,
  recentlyDroppedId,
  pendingVagaCandidateId,
  vagas,
  onDropCandidate,
  onDragStart,
  onDragEnd,
  onConfirmVaga,
  onCancelVaga,
}: KanbanBoardProps) {
  const sortedStages = useMemo(() => [...stages].sort((a, b) => a.order - b.order), [stages])

  const stageCandidatesMap = useMemo(() => {
    const map: Record<string, Candidate[]> = {}
    for (const stage of sortedStages) {
      map[stage.id] = candidates.filter((c) => c.stageId === stage.id)
    }
    return map
  }, [candidates, sortedStages])

  return (
    <>
      <div className="flex-1 overflow-x-auto pb-4 h-[calc(100vh-14rem)] md:h-[calc(100vh-12rem)]">
        <div className="flex flex-col md:flex-row gap-6 h-full items-stretch min-w-max px-1">
          {sortedStages.map((stage) => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              candidates={stageCandidatesMap[stage.id] || []}
              draggedCandidateId={draggedCandidateId}
              recentlyDroppedId={recentlyDroppedId}
              onDrop={onDropCandidate}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      </div>
      <VagaSelectDialog
        isOpen={!!pendingVagaCandidateId}
        vagas={vagas}
        onClose={onCancelVaga}
        onConfirm={onConfirmVaga}
      />
    </>
  )
}

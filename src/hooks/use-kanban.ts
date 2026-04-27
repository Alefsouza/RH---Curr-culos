import { useState, useCallback } from 'react'
import { Candidate, Stage } from '@/types/kanban'
import { INITIAL_CANDIDATES, INITIAL_STAGES } from '@/lib/mock-data'
import { useToast } from '@/hooks/use-toast'

export function useKanban() {
  const [candidates, setCandidates] = useState<Candidate[]>(INITIAL_CANDIDATES)
  const [stages, setStages] = useState<Stage[]>(INITIAL_STAGES)
  const [draggedCandidateId, setDraggedCandidateId] = useState<string | null>(null)
  const { toast } = useToast()

  const moveCandidate = useCallback(
    (candidateId: string, newStageId: string) => {
      setCandidates((prev) => {
        const candidateIndex = prev.findIndex((c) => c.id === candidateId)
        if (candidateIndex === -1) return prev

        const candidate = prev[candidateIndex]
        if (candidate.stageId === newStageId) return prev // No change

        const updatedCandidates = [...prev]
        updatedCandidates[candidateIndex] = { ...candidate, stageId: newStageId }

        // Simulate Webhook / Side effect
        console.log(
          `[WEBHOOK TRIGGER] WhatsApp notification sent to ${candidate.phone}: "Olá ${candidate.name}, seu status mudou para a etapa ${
            stages.find((s) => s.id === newStageId)?.name
          }!"`,
        )

        toast({
          title: 'Candidato movido com sucesso!',
          description: `${candidate.name} foi movido para a nova etapa.`,
        })

        return updatedCandidates
      })
    },
    [stages, toast],
  )

  const handleDragStart = useCallback((candidateId: string) => {
    setDraggedCandidateId(candidateId)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggedCandidateId(null)
  }, [])

  return {
    candidates,
    stages,
    draggedCandidateId,
    moveCandidate,
    handleDragStart,
    handleDragEnd,
  }
}

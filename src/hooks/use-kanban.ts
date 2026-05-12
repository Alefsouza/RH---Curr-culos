import { useState, useCallback, useEffect } from 'react'
import { Candidate, Stage } from '@/types/kanban'
import { useToast } from '@/hooks/use-toast'
import { fetchStages, fetchCandidates, updateCandidateStage } from '@/services/kanban'
import { useAuth } from '@/hooks/use-auth'

export function useKanban() {
  const { user } = useAuth()
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draggedCandidateId, setDraggedCandidateId] = useState<string | null>(null)
  const { toast } = useToast()

  const loadData = useCallback(async () => {
    if (!user) return
    try {
      setLoading(true)
      const [fetchedStages, fetchedCandidates] = await Promise.all([
        fetchStages(),
        fetchCandidates(),
      ])
      setStages(fetchedStages)
      setCandidates(fetchedCandidates)
      setError(null)
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar dados.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    const handleCandidateDelete = (event: any) => {
      const id = event.detail.candidateId
      setCandidates((prev) => prev.filter((c) => c.id !== id))
    }
    window.addEventListener('kanban:delete-candidate', handleCandidateDelete)
    return () => window.removeEventListener('kanban:delete-candidate', handleCandidateDelete)
  }, [])

  const moveCandidate = useCallback(
    async (candidateId: string, newStageId: string) => {
      const previousCandidates = [...candidates]

      setCandidates((prev) => {
        const candidateIndex = prev.findIndex((c) => c.id === candidateId)
        if (candidateIndex === -1) return prev

        const candidate = prev[candidateIndex]
        if (candidate.stageId === newStageId) return prev

        const updatedCandidates = [...prev]
        updatedCandidates[candidateIndex] = { ...candidate, stageId: newStageId }
        return updatedCandidates
      })

      try {
        await updateCandidateStage(candidateId, newStageId)
        const candidate = candidates.find((c) => c.id === candidateId)
        const stage = stages.find((s) => s.id === newStageId)

        console.log(
          `[WEBHOOK TRIGGER] WhatsApp notification sent to ${candidate?.phone}: "Olá ${candidate?.name}, seu status mudou para a etapa ${stage?.name}!"`,
        )

        toast({
          title: 'Currículo movido com sucesso',
        })
      } catch (err: any) {
        setCandidates(previousCandidates)
        toast({ variant: 'destructive', title: 'Erro ao mover currículo. Tente novamente.' })
      }
    },
    [candidates, stages, toast],
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
    loading,
    error,
    loadData,
  }
}

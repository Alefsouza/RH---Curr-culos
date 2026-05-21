import { useState, useCallback, useEffect } from 'react'
import { Candidate, Stage } from '@/types/kanban'
import { useToast } from '@/hooks/use-toast'
import { fetchStages, fetchCandidates, updateCandidateStage } from '@/services/kanban'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase/client'

export function useKanban() {
  const { user } = useAuth()
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draggedCandidateId, setDraggedCandidateId] = useState<string | null>(null)
  const { toast } = useToast()

  const loadData = useCallback(
    async (showLoading: boolean = true) => {
      if (!user) return
      try {
        if (showLoading) setLoading(true)
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
        if (showLoading) setLoading(false)
      }
    },
    [user],
  )

  useEffect(() => {
    loadData()

    if (!user) return

    const channel = supabase
      .channel('kanban-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'candidatos', filter: `user_id=eq.${user.id}` },
        () => loadData(false),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'analises', filter: `user_id=eq.${user.id}` },
        () => loadData(false),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadData, user])

  useEffect(() => {
    const handleCandidateDelete = (event: any) => {
      const id = event.detail.candidateId
      setCandidates((prev) => prev.filter((c) => c.id !== id))
    }
    const handleStageDelete = (event: any) => {
      const id = event.detail.stageId
      setStages((prev) => prev.filter((s) => s.id !== id))
    }
    const handleReload = () => {
      loadData(false)
    }
    window.addEventListener('kanban:delete-candidate', handleCandidateDelete)
    window.addEventListener('kanban:delete-stage', handleStageDelete)
    window.addEventListener('kanban:reload', handleReload)
    return () => {
      window.removeEventListener('kanban:delete-candidate', handleCandidateDelete)
      window.removeEventListener('kanban:delete-stage', handleStageDelete)
      window.removeEventListener('kanban:reload', handleReload)
    }
  }, [loadData])

  const moveCandidate = useCallback(
    async (candidateId: string, newStageId: string) => {
      // Validate if candidateId is a valid UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!candidateId || !uuidRegex.test(candidateId)) {
        console.warn(
          'Operação de arrastar ignorada. O ID do candidato não é um UUID válido:',
          candidateId,
        )
        return
      }

      if (!newStageId || !uuidRegex.test(newStageId)) {
        console.warn(
          'Operação de arrastar ignorada. O ID da etapa não é um UUID válido:',
          newStageId,
        )
        return
      }

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

        supabase.functions
          .invoke('enviar-whatsapp', {
            body: { candidato_id: candidateId, etapa_id: newStageId },
          })
          .then(({ data, error }) => {
            if (error || data?.error) {
              toast({
                variant: 'destructive',
                title: 'Erro no WhatsApp',
                description:
                  data?.detalhe ||
                  data?.error ||
                  error?.message ||
                  'Ocorreu um erro ao processar o envio de WhatsApp.',
              })
            } else if (data?.warning) {
              toast({
                title: 'Aviso de envio',
                description: data.message || 'Movido, mas mensagem não enviada.',
                className: 'bg-yellow-500 text-white border-yellow-600',
              })
            } else if (data?.success) {
              toast({
                title: `Mensagem enviada para ${candidate?.name || 'o candidato'}`,
                className: 'bg-green-500 text-white border-green-600',
              })
            }
          })
          .catch((err) => {
            toast({
              variant: 'destructive',
              title: 'Erro no WhatsApp',
              description: 'Ocorreu um erro no servidor ao tentar enviar a mensagem.',
            })
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

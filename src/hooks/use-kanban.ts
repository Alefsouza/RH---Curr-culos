import { useState, useCallback, useEffect } from 'react'
import { Candidate, Stage } from '@/types/kanban'
import { useToast } from '@/hooks/use-toast'
import {
  fetchStages,
  fetchCandidates,
  fetchVagas,
  updateCandidateStage,
  updateCandidateVagaAndStage,
} from '@/services/kanban'
import { invokeWhatsAppForAdvancement } from '@/lib/kanban-helpers'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase/client'

interface PendingVagaSelection {
  candidateId: string
  targetStageId: string
}

export function useKanban() {
  const { user } = useAuth()
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [vagas, setVagas] = useState<{ id: string; titulo: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draggedCandidateId, setDraggedCandidateId] = useState<string | null>(null)
  const [recentlyDroppedId, setRecentlyDroppedId] = useState<string | null>(null)
  const [pendingVagaSelection, setPendingVagaSelection] = useState<PendingVagaSelection | null>(
    null,
  )
  const { toast } = useToast()

  const triggerDropHighlight = useCallback((id: string) => {
    setRecentlyDroppedId(id)
    setTimeout(() => setRecentlyDroppedId(null), 2000)
  }, [])

  const loadData = useCallback(
    async (showLoading = true) => {
      if (!user) return
      try {
        if (showLoading) setLoading(true)
        const [s, c, v] = await Promise.all([fetchStages(), fetchCandidates(), fetchVagas()])
        setStages(s)
        setCandidates(c)
        setVagas(v)
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidatos' }, () =>
        loadData(false),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'analises' }, () =>
        loadData(false),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadData, user])

  useEffect(() => {
    const onDel = (e: any) => setCandidates((p) => p.filter((c) => c.id !== e.detail.candidateId))
    const onStageDel = (e: any) => setStages((p) => p.filter((s) => s.id !== e.detail.stageId))
    const onReload = () => loadData(false)
    window.addEventListener('kanban:delete-candidate', onDel)
    window.addEventListener('kanban:delete-stage', onStageDel)
    window.addEventListener('kanban:reload', onReload)
    return () => {
      window.removeEventListener('kanban:delete-candidate', onDel)
      window.removeEventListener('kanban:delete-stage', onStageDel)
      window.removeEventListener('kanban:reload', onReload)
    }
  }, [loadData])

  const moveCandidate = useCallback(
    async (candidateId: string, newStageId: string) => {
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!uuid.test(candidateId) || !uuid.test(newStageId)) return
      const idx = candidates.findIndex((c) => c.id === candidateId)
      if (idx === -1) return
      const candidate = candidates[idx]
      if (candidate.stageId === newStageId) return
      const targetStage = stages.find((s) => s.id === newStageId)
      if (targetStage?.name?.toLowerCase().includes('qualificad') && !candidate.vaga_id) {
        setPendingVagaSelection({ candidateId, targetStageId: newStageId })
        return
      }
      const originStage = stages.find((s) => s.id === candidate.stageId)
      const prev = [...candidates]
      setCandidates((p) => {
        const i = p.findIndex((c) => c.id === candidateId)
        if (i === -1) return p
        const u = [...p]
        u[i] = { ...p[i], stageId: newStageId }
        return u
      })
      try {
        await updateCandidateStage(candidateId, newStageId)
        triggerDropHighlight(candidateId)
        if (originStage && targetStage && targetStage.order > originStage.order)
          invokeWhatsAppForAdvancement(candidateId, candidate.stageId, candidate.name)
      } catch {
        setCandidates(prev)
        toast({ variant: 'destructive', title: 'Erro ao mover currículo. Tente novamente.' })
      }
    },
    [candidates, stages, toast, triggerDropHighlight],
  )

  const confirmVagaSelection = useCallback(
    async (vagaId: string) => {
      if (!pendingVagaSelection) return
      const { candidateId, targetStageId } = pendingVagaSelection
      const candidate = candidates.find((c) => c.id === candidateId)
      if (!candidate) {
        setPendingVagaSelection(null)
        return
      }
      const originStage = stages.find((s) => s.id === candidate.stageId)
      const targetStage = stages.find((s) => s.id === targetStageId)
      const vaga = vagas.find((v) => v.id === vagaId)
      const prev = [...candidates]
      setCandidates((p) => {
        const i = p.findIndex((c) => c.id === candidateId)
        if (i === -1) return p
        const u = [...p]
        u[i] = { ...p[i], stageId: targetStageId, vaga_id: vagaId, job: vaga?.titulo || 'Sem Vaga' }
        return u
      })
      setPendingVagaSelection(null)
      try {
        await updateCandidateVagaAndStage(candidateId, vagaId, targetStageId)
        triggerDropHighlight(candidateId)
        if (originStage && targetStage && targetStage.order > originStage.order)
          invokeWhatsAppForAdvancement(candidateId, candidate.stageId, candidate.name)
      } catch {
        setCandidates(prev)
        toast({ variant: 'destructive', title: 'Erro ao associar vaga. Tente novamente.' })
      }
    },
    [pendingVagaSelection, candidates, stages, vagas, toast, triggerDropHighlight],
  )

  const cancelVagaSelection = useCallback(() => setPendingVagaSelection(null), [])
  const handleDragStart = useCallback((id: string) => setDraggedCandidateId(id), [])
  const handleDragEnd = useCallback(() => setDraggedCandidateId(null), [])

  return {
    candidates,
    stages,
    vagas,
    draggedCandidateId,
    recentlyDroppedId,
    pendingVagaCandidateId: pendingVagaSelection?.candidateId ?? null,
    moveCandidate,
    confirmVagaSelection,
    cancelVagaSelection,
    handleDragStart,
    handleDragEnd,
    loading,
    error,
    loadData,
  }
}

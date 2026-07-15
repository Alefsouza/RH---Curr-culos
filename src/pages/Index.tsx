import { useState } from 'react'
import { useKanban } from '@/hooks/use-kanban'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Loader2, Search } from 'lucide-react'
import { createStage } from '@/services/kanban'
import { useToast } from '@/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

export default function Index() {
  const {
    candidates,
    stages,
    vagas,
    draggedCandidateId,
    recentlyDroppedId,
    pendingVagaCandidateId,
    moveCandidate,
    confirmVagaSelection,
    cancelVagaSelection,
    handleDragStart,
    handleDragEnd,
    loading,
    error,
  } = useKanban()
  const { toast } = useToast()
  const [isAddStageOpen, setIsAddStageOpen] = useState(false)
  const [newStageName, setNewStageName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [search, setSearch] = useState('')

  const filteredCandidates = search
    ? candidates.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.email.toLowerCase().includes(search.toLowerCase()),
      )
    : candidates

  const handleCreateStage = async () => {
    if (!newStageName.trim()) return
    try {
      setIsCreating(true)
      await createStage(newStageName.trim())
      toast({ title: 'Etapa criada com sucesso' })
      setNewStageName('')
      setIsAddStageOpen(false)
      window.dispatchEvent(new CustomEvent('kanban:reload'))
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao criar etapa', description: err.message })
    } finally {
      setIsCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <p className="text-destructive">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 p-4 border-b bg-white">
        <div className="flex items-center gap-3 flex-1">
          <h1 className="text-xl font-bold text-slate-800 whitespace-nowrap">
            Kanban de Candidatos
          </h1>
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar candidato..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>
        <Button onClick={() => setIsAddStageOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Nova Etapa
        </Button>
      </div>
      <KanbanBoard
        stages={stages}
        candidates={filteredCandidates}
        draggedCandidateId={draggedCandidateId}
        recentlyDroppedId={recentlyDroppedId}
        pendingVagaCandidateId={pendingVagaCandidateId}
        vagas={vagas}
        onDropCandidate={moveCandidate}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onConfirmVaga={confirmVagaSelection}
        onCancelVaga={cancelVagaSelection}
      />
      <Dialog open={isAddStageOpen} onOpenChange={setIsAddStageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Etapa</DialogTitle>
          </DialogHeader>
          <Input
            value={newStageName}
            onChange={(e) => setNewStageName(e.target.value)}
            placeholder="Nome da etapa"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddStageOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateStage} disabled={isCreating || !newStageName.trim()}>
              {isCreating ? 'Criando...' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

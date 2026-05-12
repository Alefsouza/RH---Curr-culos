import { useState } from 'react'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { useKanban } from '@/hooks/use-kanban'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { createStage } from '@/services/kanban'
import { useToast } from '@/hooks/use-toast'

export default function Index() {
  const {
    stages,
    candidates,
    draggedCandidateId,
    moveCandidate,
    handleDragStart,
    handleDragEnd,
    loadData,
    loading,
  } = useKanban()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newStageName, setNewStageName] = useState('')
  const { toast } = useToast()

  const handleCreateStage = async () => {
    if (!newStageName.trim()) return
    try {
      await createStage(newStageName.trim())
      toast({ title: 'Etapa criada com sucesso' })
      setNewStageName('')
      setIsModalOpen(false)
      loadData()
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao criar etapa' })
    }
  }

  return (
    <div className="flex flex-col h-full space-y-6 p-4 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Kanban</h1>
          <p className="text-muted-foreground">
            Gerencie o fluxo de seus candidatos e etapas de seleção.
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Etapa
        </Button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center h-[calc(100vh-14rem)]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <KanbanBoard
          stages={stages}
          candidates={candidates}
          draggedCandidateId={draggedCandidateId}
          onDropCandidate={moveCandidate}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        />
      )}

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Etapa</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Nome da etapa"
              value={newStageName}
              onChange={(e) => setNewStageName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateStage()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsModalOpen(false)
                setNewStageName('')
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreateStage}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

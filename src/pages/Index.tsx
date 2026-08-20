import { useState, useEffect, useMemo } from 'react'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { useKanban } from '@/hooks/use-kanban'
import { Button } from '@/components/ui/button'
import { Plus, Search, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { createStage } from '@/services/kanban'
import { fetchVagas } from '@/services/review'
import { useToast } from '@/hooks/use-toast'
import { startOfDay, endOfDay, isAfter, isBefore, parseISO } from 'date-fns'

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
  const [vagas, setVagas] = useState<{ id: string; titulo: string }[]>([])
  const [search, setSearch] = useState('')
  const [selectedVaga, setSelectedVaga] = useState('todas')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newStageName, setNewStageName] = useState('')
  const { toast } = useToast()

  useEffect(() => {
    fetchVagas()
      .then((data) => setVagas(data || []))
      .catch((err) => console.error('Erro ao buscar vagas:', err))
  }, [])

  const handleCreateStage = async () => {
    if (!newStageName.trim()) return
    try {
      await createStage(newStageName.trim())
      toast({ title: 'Etapa criada com sucesso' })
      setNewStageName('')
      setIsModalOpen(false)
      loadData(false)
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao criar etapa' })
    }
  }

  const hasActiveFilters = Boolean(
    search.trim() || (selectedVaga && selectedVaga !== 'todas') || startDate || endDate,
  )

  const handleClearFilters = () => {
    setSearch('')
    setSelectedVaga('todas')
    setStartDate('')
    setEndDate('')
  }

  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      // Filtro de busca textual (nome, e-mail ou telefone)
      if (search.trim()) {
        const query = search.toLowerCase().trim()
        const matchName = (c.name || '').toLowerCase().includes(query)
        const matchEmail = (c.email || '').toLowerCase().includes(query)
        const matchPhone = (c.phone || '').toLowerCase().includes(query)
        if (!matchName && !matchEmail && !matchPhone) {
          return false
        }
      }

      // Filtro de Vaga
      if (selectedVaga && selectedVaga !== 'todas') {
        const matchesVagaId = c.vagaId === selectedVaga
        const selectedVagaObj = vagas.find((v) => v.id === selectedVaga)
        const matchesVagaTitle = selectedVagaObj
          ? (c.job || '').toLowerCase() === selectedVagaObj.titulo.toLowerCase()
          : false

        if (!matchesVagaId && !matchesVagaTitle) {
          return false
        }
      }

      // Filtro de Data Inicial e Final por criado_em (ou appliedAt)
      const candDate = c.criado_em || c.appliedAt
      if (startDate && candDate) {
        try {
          if (isBefore(parseISO(candDate), startOfDay(parseISO(startDate)))) {
            return false
          }
        } catch {
          // Ignore invalid dates
        }
      }

      if (endDate && candDate) {
        try {
          if (isAfter(parseISO(candDate), endOfDay(parseISO(endDate)))) {
            return false
          }
        } catch {
          // Ignore invalid dates
        }
      }

      return true
    })
  }, [candidates, search, selectedVaga, vagas, startDate, endDate])

  return (
    <div className="flex flex-col h-full space-y-6 -m-4 md:-m-6 p-4 md:p-6 min-h-0">
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

      {/* Barra de filtros visualmente distinta */}
      <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por nome, e-mail ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-11 focus-visible:ring-primary bg-white shadow-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Select value={selectedVaga} onValueChange={setSelectedVaga}>
              <SelectTrigger className="w-full sm:w-[200px] h-11 bg-white shadow-none">
                <SelectValue placeholder="Todas as vagas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as vagas</SelectItem>
                {vagas.map((vaga) => (
                  <SelectItem key={vaga.id} value={vaga.id}>
                    {vaga.titulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="flex flex-col flex-1 sm:w-[145px]">
                <Input
                  type="date"
                  title="Data Inicial"
                  aria-label="Data Inicial"
                  placeholder="Data Inicial"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-11 bg-white text-xs sm:text-sm text-slate-700 shadow-none"
                />
              </div>
              <span className="text-slate-400 text-xs sm:text-sm font-medium">até</span>
              <div className="flex flex-col flex-1 sm:w-[145px]">
                <Input
                  type="date"
                  title="Data Final"
                  aria-label="Data Final"
                  placeholder="Data Final"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-11 bg-white text-xs sm:text-sm text-slate-700 shadow-none"
                />
              </div>
            </div>

            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearFilters}
                className="h-11 text-xs text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 gap-1.5 px-3 border-slate-200"
              >
                <X className="h-3.5 w-3.5" />
                Limpar filtros
              </Button>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center min-h-[300px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          <KanbanBoard
            stages={stages}
            candidates={filteredCandidates}
            draggedCandidateId={draggedCandidateId}
            onDropCandidate={moveCandidate}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          />
        </div>
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

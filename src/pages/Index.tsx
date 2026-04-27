import { useState, useMemo } from 'react'
import { useKanban } from '@/hooks/use-kanban'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, Plus, FilterX } from 'lucide-react'

export default function Index() {
  const { candidates, stages, draggedCandidateId, moveCandidate, handleDragStart, handleDragEnd } =
    useKanban()

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedJob, setSelectedJob] = useState<string>('all')
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all')

  const uniqueJobs = useMemo(() => Array.from(new Set(candidates.map((c) => c.job))), [candidates])

  const filteredCandidates = useMemo(() => {
    return candidates.filter((candidate) => {
      const matchesSearch = candidate.name.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesJob = selectedJob === 'all' || candidate.job === selectedJob
      // Simplify period filter for mockup (real app would check dates)
      const matchesPeriod = selectedPeriod === 'all'

      return matchesSearch && matchesJob && matchesPeriod
    })
  }, [candidates, searchQuery, selectedJob, selectedPeriod])

  const clearFilters = () => {
    setSearchQuery('')
    setSelectedJob('all')
    setSelectedPeriod('all')
  }

  const hasActiveFilters = searchQuery !== '' || selectedJob !== 'all' || selectedPeriod !== 'all'

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Pipeline de Candidatos
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Gerencie e acompanhe o progresso das suas vagas ativas.
          </p>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-700 shadow-sm gap-2">
          <Plus className="h-4 w-4" />
          Nova Etapa
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Filtrar por nome..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 border-slate-200 focus-visible:ring-blue-500 h-10 w-full"
          />
        </div>
        <Select value={selectedJob} onValueChange={setSelectedJob}>
          <SelectTrigger className="w-full sm:w-[200px] border-slate-200 h-10">
            <SelectValue placeholder="Vaga" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as vagas</SelectItem>
            {uniqueJobs.map((job) => (
              <SelectItem key={job} value={job}>
                {job}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
          <SelectTrigger className="w-full sm:w-[180px] border-slate-200 h-10">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo período</SelectItem>
            <SelectItem value="24h">Últimas 24 horas</SelectItem>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            onClick={clearFilters}
            className="text-slate-500 hover:text-slate-800 px-3 hidden sm:flex"
            title="Limpar filtros"
          >
            <FilterX className="h-4 w-4" />
          </Button>
        )}
      </div>

      <KanbanBoard
        stages={stages}
        candidates={filteredCandidates}
        draggedCandidateId={draggedCandidateId}
        onDropCandidate={moveCandidate}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      />
    </div>
  )
}

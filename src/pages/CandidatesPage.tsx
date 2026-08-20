import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import {
  getCandidatesList,
  deleteCandidate,
  updateCandidate,
  updateAnaliseStatus,
  bulkDeleteCandidates,
  identifyVagaForCandidate,
  updateCandidateVaga,
} from '@/services/candidates'
import { fetchVagas } from '@/services/review'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, Users as UsersIcon, AlertCircle, X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { CandidateTable } from '@/components/candidates/CandidateTable'
import { CandidateEditDialog } from '@/components/candidates/CandidateEditDialog'
import { CandidateDeleteDialog } from '@/components/candidates/CandidateDeleteDialog'
import { BulkActionBar } from '@/components/candidates/BulkActionBar'
import { BulkDeleteDialog } from '@/components/candidates/BulkDeleteDialog'
import { VagaSelectDialog } from '@/components/candidates/VagaSelectDialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { startOfDay, endOfDay, isAfter, isBefore, parseISO } from 'date-fns'
import { useBulkReanalysis } from '@/contexts/BulkReanalysisContext'

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<any[]>([])
  const [vagas, setVagas] = useState<{ id: string; titulo: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [editData, setEditData] = useState<any | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [pendingQualify, setPendingQualify] = useState<{
    candidateId: string
    userId: string
  } | null>(null)
  const { toast } = useToast()
  const { startReanalysis, isProcessing: isReanalyzing } = useBulkReanalysis()

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [data, vagasData] = await Promise.all([getCandidatesList(), fetchVagas()])
      setCandidates(data)
      setVagas(vagasData)
      setError(null)
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar candidatos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()

    const channel = supabase
      .channel('candidates-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'analises' }, () => {
        loadData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidatos' }, () => {
        loadData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadData])

  const filtered = useMemo(() => {
    return candidates.filter((c) => {
      const matchSearch =
        c.nome.toLowerCase().includes(search.toLowerCase()) ||
        c.email.toLowerCase().includes(search.toLowerCase()) ||
        c.vaga.toLowerCase().includes(search.toLowerCase())

      let matchStatus = true
      if (statusFilter === 'qualificado') {
        matchStatus = c.status_analise === 'qualificado'
      } else if (statusFilter === 'nao_qualificado') {
        matchStatus = c.status_analise === 'nao_qualificado'
      } else if (statusFilter === 'revisar') {
        matchStatus = c.status_analise === 'revisar'
      } else if (statusFilter === 'sem_etapa') {
        matchStatus = !c.etapa_id
      }

      let matchDate = true
      if (startDate && c.criado_em) {
        if (isBefore(parseISO(c.criado_em), startOfDay(parseISO(startDate)))) {
          matchDate = false
        }
      }
      if (endDate && c.criado_em) {
        if (isAfter(parseISO(c.criado_em), endOfDay(parseISO(endDate)))) {
          matchDate = false
        }
      }

      return matchSearch && matchStatus && matchDate
    })
  }, [candidates, search, statusFilter, startDate, endDate])

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const handleToggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allSelected = filtered.length > 0 && filtered.every((c) => prev.has(c.id))
      if (allSelected) {
        const next = new Set(prev)
        filtered.forEach((c) => next.delete(c.id))
        return next
      }
      const next = new Set(prev)
      filtered.forEach((c) => next.add(c.id))
      return next
    })
  }, [filtered])

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const handleToggleStatus = async (
    candidateId: string,
    currentStatus: string | null,
    vagaId: string | null,
  ) => {
    const newStatus = currentStatus === 'qualificado' ? 'nao_qualificado' : 'qualificado'
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Usuário não autenticado')

      if (newStatus === 'qualificado' && !vagaId) {
        setPendingQualify({ candidateId, userId: user.id })
        return
      }

      await updateAnaliseStatus(candidateId, vagaId, newStatus, user.id)
      toast({ title: 'Status atualizado com sucesso' })
      loadData()
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao atualizar status', description: err.message })
    }
  }

  const handleConfirmVaga = async (vagaId: string) => {
    if (!pendingQualify) return
    try {
      await updateCandidateVaga(pendingQualify.candidateId, vagaId)
      await updateAnaliseStatus(
        pendingQualify.candidateId,
        vagaId,
        'qualificado',
        pendingQualify.userId,
      )
      toast({ title: 'Candidato qualificado com sucesso' })
      setPendingQualify(null)
      loadData()
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao qualificar candidato',
        description: err.message,
      })
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteCandidate(deleteId)
      toast({ title: 'Candidato excluído com sucesso' })
      setDeleteId(null)
      loadData()
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: err.message })
    }
  }

  const handleEdit = async (data: { nome: string; email: string; telefone: string }) => {
    if (!editData) return
    try {
      await updateCandidate(editData.id, data)
      toast({ title: 'Candidato atualizado com sucesso' })
      setEditData(null)
      loadData()
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao atualizar', description: err.message })
    }
  }

  const handleBulkDelete = async () => {
    try {
      await bulkDeleteCandidates(Array.from(selectedIds))
      toast({
        title: 'Candidatos excluídos com sucesso',
        description: `${selectedIds.size} registro(s) removido(s).`,
      })
      setSelectedIds(new Set())
      setShowBulkDelete(false)
      loadData()
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: err.message })
    }
  }

  const handleBulkReanalyze = () => {
    const selectedCandidates = filtered
      .filter((c) => selectedIds.has(c.id))
      .map((c) => ({
        id: c.id,
        nome: c.nome,
        vaga: c.vaga,
        curriculo_url: c.curriculo_url,
      }))

    if (selectedCandidates.length === 0) return

    startReanalysis(selectedCandidates)
    setSelectedIds(new Set())
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-[200px]" />
        <Skeleton className="h-12 w-full max-w-sm" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <h2 className="text-xl font-semibold text-slate-800">Erro ao carregar candidatos</h2>
        <p className="text-slate-500">{error}</p>
        <Button onClick={loadData}>Tentar Novamente</Button>
      </div>
    )
  }

  const hasActiveFilters = search || statusFilter !== 'todos' || startDate || endDate
  const handleClearFilters = () => {
    setSearch('')
    setStatusFilter('todos')
    setStartDate('')
    setEndDate('')
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Cabeçalho: Título e descrição */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Candidatos</h1>
        <p className="text-sm text-slate-500">
          Gerencie todos os talentos cadastrados no processo seletivo.
        </p>
      </div>

      {/* Barra de filtros */}
      <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por nome, e-mail ou vaga..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-11 focus-visible:ring-primary bg-white shadow-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[170px] h-11 bg-white shadow-none">
                <SelectValue placeholder="Filtrar por Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="qualificado">Qualificados</SelectItem>
                <SelectItem value="nao_qualificado">Não Qualificados</SelectItem>
                <SelectItem value="revisar">Para Revisão</SelectItem>
                <SelectItem value="sem_etapa">Sem Etapa</SelectItem>
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

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[40vh] border rounded-xl bg-white border-dashed shadow-sm">
          <div className="bg-slate-100 p-4 rounded-full mb-4">
            <UsersIcon className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-900">Nenhum candidato encontrado</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm text-center">
            {search
              ? 'Ajuste seus termos de busca para encontrar candidatos.'
              : 'Ainda não há candidatos na sua base de talentos.'}
          </p>
        </div>
      ) : (
        <CandidateTable
          candidates={filtered}
          vagas={vagas}
          onEdit={setEditData}
          onDelete={setDeleteId}
          onToggleStatus={handleToggleStatus}
          onRefresh={loadData}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onToggleSelectAll={handleToggleSelectAll}
        />
      )}

      <CandidateEditDialog
        candidate={editData}
        onClose={() => setEditData(null)}
        onSave={handleEdit}
      />

      <CandidateDeleteDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
      />

      <BulkDeleteDialog
        isOpen={showBulkDelete}
        count={selectedIds.size}
        onClose={() => setShowBulkDelete(false)}
        onConfirm={handleBulkDelete}
      />

      <BulkActionBar
        count={selectedIds.size}
        onReanalyze={handleBulkReanalyze}
        onDelete={() => setShowBulkDelete(true)}
        onClear={handleClearSelection}
        isReanalyzing={isReanalyzing}
      />

      <VagaSelectDialog
        isOpen={!!pendingQualify}
        vagas={vagas}
        onClose={() => setPendingQualify(null)}
        onConfirm={handleConfirmVaga}
      />
    </div>
  )
}

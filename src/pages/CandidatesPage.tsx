import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import {
  getCandidatesList,
  deleteCandidate,
  updateCandidate,
  updateAnaliseStatus,
} from '@/services/candidates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, Users as UsersIcon, AlertCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { CandidateTable } from '@/components/candidates/CandidateTable'
import { CandidateEditDialog } from '@/components/candidates/CandidateEditDialog'
import { CandidateDeleteDialog } from '@/components/candidates/CandidateDeleteDialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [editData, setEditData] = useState<any | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const { toast } = useToast()

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const data = await getCandidatesList()
      setCandidates(data)
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
      }

      return matchSearch && matchStatus
    })
  }, [candidates, search, statusFilter])

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

      await updateAnaliseStatus(candidateId, vagaId, newStatus, user.id)
      toast({ title: 'Status atualizado com sucesso' })
      loadData()
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao atualizar status', description: err.message })
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Candidatos</h1>
          <p className="text-sm text-slate-500 mt-1">
            Gerencie todos os talentos cadastrados no processo seletivo.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px] h-11">
              <SelectValue placeholder="Filtrar por Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="qualificado">Qualificados</SelectItem>
              <SelectItem value="nao_qualificado">Não Qualificados</SelectItem>
              <SelectItem value="revisar">Para Revisão</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative w-full sm:w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por nome, e-mail ou vaga..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-11 focus-visible:ring-primary"
            />
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
          onEdit={setEditData}
          onDelete={setDeleteId}
          onToggleStatus={handleToggleStatus}
          onRefresh={loadData}
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
    </div>
  )
}

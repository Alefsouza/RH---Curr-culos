import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { vagasService, VagaComEstatisticas } from '@/services/vagas'
import { VagasList } from '@/components/vagas/VagasList'
import { VagaFormModal } from '@/components/vagas/VagaFormModal'
import { VagaDeleteModal } from '@/components/vagas/VagaDeleteModal'
import { Button } from '@/components/ui/button'
import { Plus, Briefcase, AlertCircle, RefreshCw } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export default function JobsPage() {
  const { user } = useAuth()
  const [vagas, setVagas] = useState<VagaComEstatisticas[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingVaga, setEditingVaga] = useState<VagaComEstatisticas | null>(null)

  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [deletingVaga, setDeletingVaga] = useState<VagaComEstatisticas | null>(null)

  const fetchVagas = useCallback(async () => {
    if (!user) return
    try {
      setLoading(true)
      setError(null)
      const data = await vagasService.getVagasComEstatisticas()
      setVagas(data)
    } catch (err: any) {
      setError('Não foi possível carregar as vagas. ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchVagas()
  }, [fetchVagas])

  const handleCreate = () => {
    setEditingVaga(null)
    setIsFormOpen(true)
  }

  const handleEdit = (vaga: VagaComEstatisticas) => {
    setEditingVaga(vaga)
    setIsFormOpen(true)
  }

  const handleDelete = (vaga: VagaComEstatisticas) => {
    setDeletingVaga(vaga)
    setIsDeleteOpen(true)
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-4">
            <p>{error}</p>
            <Button variant="outline" size="sm" onClick={fetchVagas}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto w-full flex-1 flex flex-col min-h-0 space-y-6 pb-24">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Gestão de Vagas</h1>
          <p className="text-slate-500 text-sm mt-1">
            Gerencie suas vagas e critérios de qualificação
          </p>
        </div>
        <Button onClick={handleCreate} className="shadow-sm hidden sm:flex">
          <Plus className="h-4 w-4 mr-2" />
          Nova Vaga
        </Button>
      </div>

      {vagas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50 flex-1">
          <Briefcase className="h-12 w-12 text-slate-300 mb-4" />
          <h3 className="text-lg font-medium text-slate-700">Nenhuma vaga cadastrada</h3>
          <p className="text-slate-500 text-sm mt-1 text-center max-w-md mb-6">
            Crie sua primeira vaga para começar a receber e analisar candidatos automaticamente.
          </p>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Criar Primeira Vaga
          </Button>
        </div>
      ) : (
        <div className="overflow-y-auto">
          <VagasList
            vagas={vagas}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onToggleAtiva={(vagaId, novaAtiva) => {
              setVagas((prev) =>
                prev.map((v) => (v.id === vagaId ? { ...v, ativa: novaAtiva } : v)),
              )
            }}
          />
        </div>
      )}

      <VagaFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        vaga={editingVaga}
        onSaved={fetchVagas}
      />

      <VagaDeleteModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        vaga={deletingVaga}
        onDeleted={fetchVagas}
      />

      <div className="sm:hidden fixed bottom-6 right-6 z-50">
        <Button size="icon" className="h-14 w-14 rounded-full shadow-lg" onClick={handleCreate}>
          <Plus className="h-6 w-6" />
        </Button>
      </div>
    </div>
  )
}

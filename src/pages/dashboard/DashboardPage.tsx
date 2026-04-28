import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Download, AlertCircle, BarChart3, Filter } from 'lucide-react'
import { MetricsCards } from './MetricsCards'
import { DashboardCharts } from './DashboardCharts'
import { DetailsTable } from './DetailsTable'
import { startOfDay, endOfDay, isAfter, isBefore, parseISO, format } from 'date-fns'
import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [data, setData] = useState<any>({
    candidatos: [],
    etapas: [],
    vagas: [],
    analises: [],
    candidatoEtapas: [],
  })

  const [filters, setFilters] = useState({
    vagaId: 'all',
    etapaId: 'all',
    startDate: '',
    endDate: '',
  })

  const loadData = async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const [candRes, etapasRes, vagasRes, analisesRes, ceRes] = await Promise.all([
        supabase.from('candidatos').select('*').eq('user_id', user.id),
        supabase.from('etapas').select('*').eq('user_id', user.id).order('ordem'),
        supabase.from('vagas').select('*').eq('user_id', user.id),
        supabase.from('analises').select('*').eq('user_id', user.id),
        supabase
          .from('candidato_etapa')
          .select('*')
          .eq('usuario_id', user.id)
          .order('data_entrada'),
      ])

      if (candRes.error) throw candRes.error

      setData({
        candidatos: candRes.data || [],
        etapas: etapasRes.data || [],
        vagas: vagasRes.data || [],
        analises: analisesRes.data || [],
        candidatoEtapas: ceRes.data || [],
      })
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar dados do dashboard.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [user])

  const filteredCandidatos = data.candidatos.filter((c: any) => {
    if (filters.vagaId !== 'all' && c.vaga_id !== filters.vagaId) return false
    if (filters.etapaId !== 'all' && c.etapa_id !== filters.etapaId) return false

    if (filters.startDate && c.criado_em) {
      if (isBefore(parseISO(c.criado_em), startOfDay(parseISO(filters.startDate)))) return false
    }
    if (filters.endDate && c.criado_em) {
      if (isAfter(parseISO(c.criado_em), endOfDay(parseISO(filters.endDate)))) return false
    }
    return true
  })

  const handlePrint = () => {
    window.print()
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-[350px] w-full" />
          <Skeleton className="h-[350px] w-full" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-full min-h-[400px] text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-800 mb-2">Erro ao carregar relatórios</h2>
        <p className="text-slate-600 mb-6">{error}</p>
        <Button onClick={loadData}>Tentar Novamente</Button>
      </div>
    )
  }

  const isEmpty = data.candidatos.length === 0

  if (isEmpty) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-full min-h-[400px] text-center max-w-7xl mx-auto">
        <BarChart3 className="h-16 w-16 text-slate-300 mb-4" />
        <h2 className="text-xl font-bold text-slate-800 mb-2">Nenhum dado disponível</h2>
        <p className="text-slate-600">Ainda não há candidatos cadastrados para gerar relatórios.</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto print-container">
      <style>{`
        @media print {
          body { background-color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: A4 landscape; margin: 10mm; }
          ::-webkit-scrollbar { display: none; }
          [data-sidebar="sidebar"] { display: none !important; }
          [data-sidebar="inset"], main { margin: 0 !important; padding: 0 !important; width: 100% !important; }
        }
      `}</style>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Relatórios e Métricas
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Acompanhe o desempenho do seu processo seletivo
          </p>
        </div>
        <Button onClick={handlePrint} className="gap-2" variant="outline">
          <Download className="h-4 w-4" />
          <span>Exportar PDF</span>
        </Button>
      </div>

      <div className="bg-slate-50 p-5 rounded-xl mb-8 border border-slate-200 print:hidden">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
            Filtros de Análise
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Vaga</label>
            <Select
              value={filters.vagaId}
              onValueChange={(val) => setFilters({ ...filters, vagaId: val })}
            >
              <SelectTrigger className="bg-white h-11">
                <SelectValue placeholder="Todas as vagas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as vagas</SelectItem>
                {data.vagas.map((v: any) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.titulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Etapa</label>
            <Select
              value={filters.etapaId}
              onValueChange={(val) => setFilters({ ...filters, etapaId: val })}
            >
              <SelectTrigger className="bg-white h-11">
                <SelectValue placeholder="Todas as etapas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as etapas</SelectItem>
                {data.etapas.map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Data Inicial</label>
            <Input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              className="bg-white text-slate-700 h-11"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Data Final</label>
            <Input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              className="bg-white text-slate-700 h-11"
            />
          </div>
        </div>
      </div>

      <div className="hidden print:block mb-8 pb-4 border-b border-slate-200 text-sm text-slate-600">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          Relatório do Kanban de Candidatos
        </h1>
        <p>Gerado em: {format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
        <p>
          Período:{' '}
          {filters.startDate ? format(parseISO(filters.startDate), 'dd/MM/yyyy') : 'Início'} a{' '}
          {filters.endDate ? format(parseISO(filters.endDate), 'dd/MM/yyyy') : 'Hoje'}
        </p>
      </div>

      <MetricsCards candidatos={filteredCandidatos} analises={data.analises} />

      <DashboardCharts
        candidatos={filteredCandidatos}
        etapas={data.etapas}
        vagas={data.vagas}
        candidatoEtapas={data.candidatoEtapas}
        analises={data.analises}
      />

      <DetailsTable
        candidatos={filteredCandidatos}
        etapas={data.etapas}
        vagas={data.vagas}
        analises={data.analises}
      />
    </div>
  )
}

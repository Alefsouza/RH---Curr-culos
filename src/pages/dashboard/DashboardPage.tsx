import { useState, useEffect, useCallback } from 'react'
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
import { Badge } from '@/components/ui/badge'
import { Download, AlertCircle, BarChart3, Filter, X } from 'lucide-react'
import { MetricsCards } from './MetricsCards'
import { DashboardCharts } from './DashboardCharts'
import { DetailsTable } from './DetailsTable'
import { startOfDay, endOfDay, isAfter, isBefore, parseISO, format } from 'date-fns'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Each chart can report multi-selection state back to the dashboard.
 * `etapaIds` e `vagaIds` são arrays para suportar multi-seleção (Ctrl+Click).
 * O legado `etapaId`/`vagaId` single-value é mantido apenas para os dropdowns
 * — quando há múltipla seleção por gráfico, o dropdown correspondente é
 * "sincronizado" exibindo "Múltiplas seleções" (sem valor real).
 */
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

  // Estado de seleção multi-categoria vindo dos gráficos (estilo Power BI).
  const [selectedEtapas, setSelectedEtapas] = useState<string[]>([])
  const [selectedVagas, setSelectedVagas] = useState<string[]>([])

  // Filtros do painel superior (dropdowns + datas).
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
        supabase.from('candidatos').select('*'),
        supabase.from('etapas').select('*').order('ordem'),
        supabase.from('vagas').select('*'),
        supabase.from('analises').select('*'),
        supabase.from('candidato_etapa').select('*').order('data_entrada'),
      ])

      if (candRes.error) throw candRes.error
      if (analisesRes.error) throw analisesRes.error

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

  // ---- Helpers de nome legível para badges ----
  const getEtapaNome = useCallback(
    (id: string) => data.etapas.find((e: any) => e.id === id)?.nome,
    [data.etapas],
  )
  const getVagaNome = useCallback(
    (id: string) => data.vagas.find((v: any) => v.id === id)?.titulo,
    [data.vagas],
  )

  // ---- Manipuladores de seleção vindos dos gráficos (click / ctrl+click) ----
  // Aplicam o comportamento estilo Power BI:
  //  - click simples: seleciona somente aquela categoria (substitui seleção atual)
  //  - ctrl/meta+click: alterna (toggle) aquela categoria, mantendo as demais
  //  - clicar numa categoria já selecionada (sem ctrl): remove da seleção
  const toggleSelection = useCallback(
    (
      id: string,
      list: string[],
      setter: React.Dispatch<React.SetStateAction<string[]>>,
      e?: React.MouseEvent | React.PointerEvent,
    ) => {
      const isAccumulative = !!(e && (e.ctrlKey || e.metaKey || e.shiftKey))
      setter((prev) => {
        if (isAccumulative) {
          return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        }
        // Click simples: se já estava sozinho selecionado -> limpa, senão seleciona só ele.
        if (prev.length === 1 && prev[0] === id) return []
        return [id]
      })
    },
    [],
  )

  const handleToggleEtapa = useCallback(
    (id: string, e?: React.MouseEvent) => toggleSelection(id, selectedEtapas, setSelectedEtapas, e),
    [selectedEtapas, toggleSelection],
  )
  const handleToggleVaga = useCallback(
    (id: string, e?: React.MouseEvent) => toggleSelection(id, selectedVagas, setSelectedVagas, e),
    [selectedVagas, toggleSelection],
  )

  // ---- Sincronização dropdowns <-> gráficos ----
  // Os dropdowns são single-select (shadcn Select), então ao escolher um valor
  // único neles definimos a seleção correspondente; "all" limpa tudo.
  const handleVagaDropdownChange = (val: string) => {
    setFilters((f) => ({ ...f, vagaId: val }))
    setSelectedVagas(val === 'all' ? [] : [val])
  }
  const handleEtapaDropdownChange = (val: string) => {
    setFilters((f) => ({ ...f, etapaId: val }))
    setSelectedEtapas(val === 'all' ? [] : [val])
  }

  // Quando a seleção (vinda dos gráficos) passa a ter exatamente um item,
  // refletimos isso no dropdown correspondente para feedback visual bidirecional.
  useEffect(() => {
    if (selectedVagas.length === 1) {
      setFilters((f) => (f.vagaId === selectedVagas[0] ? f : { ...f, vagaId: selectedVagas[0] }))
    } else if (selectedVagas.length === 0 && filters.vagaId !== 'all') {
      setFilters((f) => ({ ...f, vagaId: 'all' }))
    } else if (selectedVagas.length > 1 && filters.vagaId !== '__multi__') {
      // Múltipla seleção: o dropdown não consegue mostrar vários valores,
      // marcamos um valor sentinela para exibir "Múltiplas seleções".
      setFilters((f) => ({ ...f, vagaId: '__multi__' }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVagas])

  useEffect(() => {
    if (selectedEtapas.length === 1) {
      setFilters((f) =>
        f.etapaId === selectedEtapas[0] ? f : { ...f, etapaId: selectedEtapas[0] },
      )
    } else if (selectedEtapas.length === 0 && filters.etapaId !== 'all') {
      setFilters((f) => ({ ...f, etapaId: 'all' }))
    } else if (selectedEtapas.length > 1 && filters.etapaId !== '__multi__') {
      setFilters((f) => ({ ...f, etapaId: '__multi__' }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEtapas])

  // ---- Remoção individual de filtro (botão "x" nos badges) ----
  const removeEtapaFilter = (id: string) => setSelectedEtapas((p) => p.filter((x) => x !== id))
  const removeVagaFilter = (id: string) => setSelectedVagas((p) => p.filter((x) => x !== id))
  const clearAllFilters = () => {
    setSelectedEtapas([])
    setSelectedVagas([])
    setFilters({ vagaId: 'all', etapaId: 'all', startDate: '', endDate: '' })
  }

  const hasChartFilters = selectedEtapas.length > 0 || selectedVagas.length > 0

  // ---- Filtro final de candidatos (dropdown + multi-seleção de gráficos + datas) ----
  const filteredCandidatos = data.candidatos.filter((c: any) => {
    // Vaga: dropdown único OU multi-seleção do gráfico de vagas
    if (filters.vagaId !== 'all' && filters.vagaId !== '__multi__' && c.vaga_id !== filters.vagaId)
      return false
    if (selectedVagas.length > 0 && !selectedVagas.includes(c.vaga_id)) return false

    // Etapa: dropdown único OU multi-seleção dos gráficos de etapas
    if (
      filters.etapaId !== 'all' &&
      filters.etapaId !== '__multi__' &&
      c.etapa_id !== filters.etapaId
    )
      return false
    if (selectedEtapas.length > 0 && !selectedEtapas.includes(c.etapa_id)) return false

    if (filters.startDate && c.criado_em) {
      if (isBefore(parseISO(c.criado_em), startOfDay(parseISO(filters.startDate)))) return false
    }
    if (filters.endDate && c.criado_em) {
      if (isAfter(parseISO(c.criado_em), endOfDay(parseISO(filters.endDate)))) return false
    }
    return true
  })

  // ---- Dados para os gráficos: candidatos brutos, filtrados APENAS por data ----
  // A seleção de vaga/etapa (vinda dos próprios gráficos ou dos dropdowns) controla
  // unicamente a COR das barras (azul forte = selecionado, cinza claro = demais),
  // nunca os dados. Assim, ao clicar numa barra, as demais permanecem visíveis com
  // seus valores reais em vez de caírem para zero.
  const chartCandidatos = data.candidatos.filter((c: any) => {
    if (filters.startDate && c.criado_em) {
      if (isBefore(parseISO(c.criado_em), startOfDay(parseISO(filters.startDate)))) return false
    }
    if (filters.endDate && c.criado_em) {
      if (isAfter(parseISO(c.criado_em), endOfDay(parseISO(filters.endDate)))) return false
    }
    return true
  })
  const chartCandidatoIds = new Set(chartCandidatos.map((c: any) => c.id))
  const chartCandidatoEtapas = data.candidatoEtapas.filter((ce: any) =>
    chartCandidatoIds.has(ce.candidato_id),
  )

  const handlePrint = () => {
    window.print()
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
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

  const isVagaMulti = filters.vagaId === '__multi__'
  const isEtapaMulti = filters.etapaId === '__multi__'

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto print-container">
      <style>{`
        @media print {
          body { background-color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: A4 landscape; margin: 10mm; }
          ::-webkit-scrollbar { display: none; }
          [data-sidebar="sidebar"] { display: none !important; }
          [data-sidebar="inset"], main { margin: 0 !important; padding: 0 !important; width: 100% !important; }
        }
      `}</style>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 sm:mb-8 print:hidden">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
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

      {/* Filtros (dropdowns + datas) */}
      <div className="bg-slate-50 p-4 sm:p-5 rounded-xl mb-6 border border-slate-200 print:hidden">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
            Filtros de Análise
          </h3>
          {hasChartFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="ml-auto h-7 text-xs text-slate-500 hover:text-slate-700"
            >
              Limpar filtros
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600">Vaga</label>
            <Select
              value={isVagaMulti ? '__multi__' : filters.vagaId}
              onValueChange={handleVagaDropdownChange}
            >
              <SelectTrigger className="bg-white h-11">
                <SelectValue placeholder="Todas as vagas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as vagas</SelectItem>
                {isVagaMulti && (
                  <SelectItem value="__multi__" disabled>
                    Múltiplas seleções ({selectedVagas.length})
                  </SelectItem>
                )}
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
              value={isEtapaMulti ? '__multi__' : filters.etapaId}
              onValueChange={handleEtapaDropdownChange}
            >
              <SelectTrigger className="bg-white h-11">
                <SelectValue placeholder="Todas as etapas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as etapas</SelectItem>
                {isEtapaMulti && (
                  <SelectItem value="__multi__" disabled>
                    Múltiplas seleções ({selectedEtapas.length})
                  </SelectItem>
                )}
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

        {/* Badges de filtros ativos vindos dos gráficos */}
        {hasChartFilters && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500 mr-1">Filtros ativos:</span>
              {selectedEtapas.map((id) => (
                <Badge
                  key={`etapa-${id}`}
                  variant="secondary"
                  className="gap-1 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border-none pr-1"
                >
                  {getEtapaNome(id) || id}
                  <button
                    type="button"
                    onClick={() => removeEtapaFilter(id)}
                    className="ml-0.5 rounded-full hover:bg-indigo-300 p-0.5"
                    aria-label={`Remover filtro ${getEtapaNome(id) || id}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {selectedVagas.map((id) => (
                <Badge
                  key={`vaga-${id}`}
                  variant="secondary"
                  className="gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-none pr-1"
                >
                  {getVagaNome(id) || id}
                  <button
                    type="button"
                    onClick={() => removeVagaFilter(id)}
                    className="ml-0.5 rounded-full hover:bg-emerald-300 p-0.5"
                    aria-label={`Remover filtro ${getVagaNome(id) || id}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="h-6 text-xs text-slate-500 hover:text-slate-700 ml-1"
              >
                Limpar tudo
              </Button>
            </div>
          </div>
        )}
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
        selectedEtapas={selectedEtapas}
        selectedVagas={selectedVagas}
        onToggleEtapa={handleToggleEtapa}
        onToggleVaga={handleToggleVaga}
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

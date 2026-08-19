import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  Cell,
  ReferenceLine,
} from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { differenceInDays, parseISO } from 'date-fns'
import { Info } from 'lucide-react'

type ChartProps = {
  candidatos: any[]
  etapas: any[]
  vagas: any[]
  candidatoEtapas: any[]
  analises: any[]
  selectedEtapas: string[]
  selectedVagas: string[]
  onToggleEtapa: (id: string, e?: React.MouseEvent) => void
  onToggleVaga: (id: string, e?: React.MouseEvent) => void
}

// Cores para as categorias selecionadas / não selecionadas.
const COLOR_ACTIVE = 'hsl(var(--primary))'
const COLOR_ACTIVE_ACCENT = 'hsl(217 91% 60%)' // azul mais forte para destaque
const COLOR_DIMMED = 'hsl(var(--muted-foreground) / 0.25)'
const COLOR_LINE_DIMMED = 'hsl(var(--muted-foreground) / 0.25)'
const COLOR_LINE_ACTIVE = 'hsl(var(--primary))'
const COLOR_DOT_ACTIVE = 'hsl(217 91% 60%)'

// Texto de ajuda exibido no canto dos cards.
function InteractionHint() {
  return (
    <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400">
      <Info className="h-3 w-3" />
      <span>Clique para filtrar · Ctrl+Clique para múltipla seleção</span>
    </div>
  )
}

/**
 * Os gráficos recebem candidatos brutos (filtrados apenas por data, NUNCA por
 * vaga/etapa). A seleção de vaga/etapa controla APENAS a cor das barras/pontos:
 * azul forte para o(s) selecionado(s), cinza claro para as demais — nunca os dados.
 * Com isso, ao clicar numa barra, as demais continuam visíveis com seus valores reais.
 */
export function DashboardCharts({
  candidatos,
  etapas,
  vagas,
  candidatoEtapas,
  analises,
  selectedEtapas,
  selectedVagas,
  onToggleEtapa,
  onToggleVaga,
}: ChartProps) {
  // Se há alguma etapa selecionada, as demais ficam esmaecidas.
  const hasEtapaSelection = selectedEtapas.length > 0
  // Se há alguma vaga selecionada, as demais ficam esmaeceadas.
  const hasVagaSelection = selectedVagas.length > 0

  // ---- Funil de Candidatos (barras horizontais por etapa) ----
  const funnelData = etapas.map((e: any) => ({
    id: e.id,
    nome: e.nome,
    quantidade: candidatos.filter((c: any) => c.etapa_id === e.id).length,
    active: selectedEtapas.includes(e.id),
  }))

  const handleFunnelBar = (payload: any, e?: React.MouseEvent) => {
    if (payload && payload.id) onToggleEtapa(payload.id, e)
  }

  // ---- Tempo Médio por Etapa (linha) ----
  const timePerStage = etapas.map((e: any) => {
    const entries = candidatoEtapas.filter((ce: any) => ce.etapa_id === e.id)
    let totalDays = 0,
      count = 0

    entries.forEach((entry: any) => {
      const nextEntry = candidatoEtapas.find(
        (ce: any) => ce.candidato_id === entry.candidato_id && ce.data_entrada > entry.data_entrada,
      )
      const endDate = nextEntry ? parseISO(nextEntry.data_entrada) : new Date()
      const days = differenceInDays(endDate, parseISO(entry.data_entrada))
      if (days >= 0) {
        totalDays += days
        count++
      }
    })

    return {
      id: e.id,
      nome: e.nome,
      dias: count > 0 ? Math.round(totalDays / count) : 0,
      active: selectedEtapas.includes(e.id),
    }
  })

  const handleLineDot = (payload: any, e?: React.MouseEvent) => {
    if (payload && payload.id) onToggleEtapa(payload.id, e)
  }

  // ---- Taxa de Aprovação por Vaga (barras verticais) ----
  const approvalData = vagas.map((v: any) => {
    const cands = candidatos.filter((c: any) => c.vaga_id === v.id)
    const total = cands.length
    const aprovados = cands.filter((c: any) =>
      analises.some((a: any) => a.candidato_id === c.id && a.resultado === 'qualificado'),
    ).length

    return {
      id: v.id,
      nome: v.titulo,
      taxa: total > 0 ? Math.round((aprovados / total) * 100) : 0,
      active: selectedVagas.includes(v.id),
    }
  })

  const handleApprovalBar = (payload: any, e?: React.MouseEvent) => {
    if (payload && payload.id) onToggleVaga(payload.id, e)
  }

  // Renderizador de dot customizado para a linha — destaca os selecionados e
  // permite clicar/ctrl+clicar diretamente no ponto.
  const renderDot = (props: any) => {
    const { cx, cy, payload, index } = props
    if (cx == null || cy == null) return null
    const isActive = payload?.active
    const isSelected = hasEtapaSelection
    const r = isActive ? 6 : 4
    const fill = isSelected ? (isActive ? COLOR_DOT_ACTIVE : COLOR_LINE_DIMMED) : COLOR_LINE_ACTIVE
    const stroke = '#fff'
    return (
      <circle
        key={`dot-${index}`}
        cx={cx}
        cy={cy}
        r={r}
        fill={fill}
        stroke={stroke}
        strokeWidth={2}
        style={{ cursor: 'pointer' }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          // captura ctrl/meta antes do recharts subir o evento
          handleLineDot(payload, e as unknown as React.MouseEvent)
          e.stopPropagation()
        }}
      />
    )
  }

  // Tooltip customizado: mostra destaque visual só na categoria selecionada.
  const renderTooltip = (color: string) => (props: any) => {
    const { payload } = props
    if (!payload || !payload.length) return <ChartTooltipContent {...props} />
    const item = payload[0]
    const isActive = hasEtapaSelection ? item?.payload?.active : true
    return <ChartTooltipContent {...props} color={isActive ? color : COLOR_LINE_DIMMED} />
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
      {/* 1. Funil de Candidatos */}
      <Card className="flex flex-col">
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <CardTitle className="text-slate-800 text-base sm:text-lg">Funil de Candidatos</CardTitle>
          <InteractionHint />
        </CardHeader>
        <CardContent className="h-[280px] sm:h-[300px]">
          <ChartContainer
            config={{ quantidade: { label: 'Candidatos', color: COLOR_ACTIVE } }}
            className="h-full w-full"
          >
            <BarChart
              data={funnelData}
              layout="vertical"
              margin={{ left: 0, right: 8, top: 0, bottom: 0 }}
              barCategoryGap={8}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
              <XAxis type="number" hide />
              <YAxis
                dataKey="nome"
                type="category"
                width={110}
                axisLine={false}
                tickLine={false}
                className="text-[11px] sm:text-xs text-slate-600"
                tick={{ fill: 'currentColor' }}
              />
              <ChartTooltip
                content={<ChartTooltipContent />}
                cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
              />
              <Bar
                dataKey="quantidade"
                radius={[0, 4, 4, 0]}
                barSize={22}
                cursor="pointer"
                onClick={(data: any, _index: number, e: any) => handleFunnelBar(data, e)}
              >
                {funnelData.map((entry) => (
                  <Cell
                    key={`funnel-${entry.id}`}
                    fill={
                      hasEtapaSelection
                        ? entry.active
                          ? COLOR_ACTIVE_ACCENT
                          : COLOR_DIMMED
                        : COLOR_ACTIVE
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* 2. Tempo Médio por Etapa */}
      <Card className="flex flex-col">
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <CardTitle className="text-slate-800 text-base sm:text-lg">
            Tempo Médio por Etapa (Dias)
          </CardTitle>
          <InteractionHint />
        </CardHeader>
        <CardContent className="h-[280px] sm:h-[300px]">
          <ChartContainer
            config={{ dias: { label: 'Dias', color: COLOR_ACTIVE } }}
            className="h-full w-full"
          >
            <LineChart data={timePerStage} margin={{ left: -16, right: 8, top: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="nome"
                axisLine={false}
                tickLine={false}
                className="text-[11px] sm:text-xs text-slate-600"
                tick={{ fill: 'currentColor' }}
                interval={0}
                angle={-15}
                textAnchor="end"
                height={48}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                className="text-[11px] sm:text-xs text-slate-600"
                tick={{ fill: 'currentColor' }}
                width={32}
              />
              <ChartTooltip
                content={renderTooltip(COLOR_LINE_ACTIVE)}
                cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }}
              />
              <Line
                type="monotone"
                dataKey="dias"
                stroke={hasEtapaSelection ? COLOR_LINE_DIMMED : COLOR_LINE_ACTIVE}
                strokeWidth={hasEtapaSelection ? 2 : 3}
                dot={renderDot}
                activeDot={false}
              />
              {/* Linha horizontal de média global para referência */}
              {timePerStage.length > 0 && (
                <ReferenceLine
                  y={timePerStage.reduce((acc, e) => acc + e.dias, 0) / (timePerStage.length || 1)}
                  stroke="#cbd5e1"
                  strokeDasharray="2 4"
                  label={{ value: 'Média', fontSize: 10, fill: '#94a3b8', position: 'right' }}
                />
              )}
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* 3. Taxa de Aprovação por Vaga */}
      <Card className="lg:col-span-2 flex flex-col">
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <CardTitle className="text-slate-800 text-base sm:text-lg">
            Taxa de Aprovação por Vaga (%)
          </CardTitle>
          <InteractionHint />
        </CardHeader>
        <CardContent className="h-[280px] sm:h-[300px]">
          <ChartContainer
            config={{ taxa: { label: 'Aprovação (%)', color: COLOR_ACTIVE } }}
            className="h-full w-full"
          >
            <BarChart data={approvalData} margin={{ left: -16, right: 8, top: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="nome"
                axisLine={false}
                tickLine={false}
                className="text-[11px] sm:text-xs text-slate-600"
                tick={{ fill: 'currentColor' }}
                interval={0}
                angle={-15}
                textAnchor="end"
                height={48}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                className="text-[11px] sm:text-xs text-slate-600"
                tick={{ fill: 'currentColor' }}
                width={32}
              />
              <ChartTooltip
                content={<ChartTooltipContent />}
                cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
              />
              <Bar
                dataKey="taxa"
                radius={[4, 4, 0, 0]}
                barSize={32}
                cursor="pointer"
                onClick={(data: any, _index: number, e: any) => handleApprovalBar(data, e)}
              >
                {approvalData.map((entry) => (
                  <Cell
                    key={`approval-${entry.id}`}
                    fill={
                      hasVagaSelection
                        ? entry.active
                          ? COLOR_ACTIVE_ACCENT
                          : COLOR_DIMMED
                        : COLOR_ACTIVE
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  )
}

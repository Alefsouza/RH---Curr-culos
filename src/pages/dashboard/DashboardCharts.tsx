import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { differenceInDays, parseISO } from 'date-fns'

export function DashboardCharts({ candidatos, etapas, vagas, candidatoEtapas, analises }: any) {
  const funnelData = etapas.map((e: any) => ({
    nome: e.nome,
    quantidade: candidatos.filter((c: any) => c.etapa_id === e.id).length,
  }))

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

    return { nome: e.nome, dias: count > 0 ? Math.round(totalDays / count) : 0 }
  })

  const approvalData = vagas.map((v: any) => {
    const cands = candidatos.filter((c: any) => c.vaga_id === v.id)
    const total = cands.length
    const aprovados = cands.filter((c: any) =>
      analises.some((a: any) => a.candidato_id === c.id && a.resultado === 'qualificado'),
    ).length

    return { nome: v.titulo, taxa: total > 0 ? Math.round((aprovados / total) * 100) : 0 }
  })

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-slate-800">Funil de Candidatos</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ChartContainer
            config={{ quantidade: { label: 'Candidatos', color: 'hsl(var(--primary))' } }}
            className="h-full w-full"
          >
            <BarChart
              data={funnelData}
              layout="vertical"
              margin={{ left: 0, right: 0, top: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
              <XAxis type="number" hide />
              <YAxis
                dataKey="nome"
                type="category"
                width={120}
                axisLine={false}
                tickLine={false}
                className="text-xs text-slate-600"
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="quantidade"
                fill="var(--color-quantidade)"
                radius={[0, 4, 4, 0]}
                barSize={24}
              />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-slate-800">Tempo Médio por Etapa (Dias)</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ChartContainer
            config={{ dias: { label: 'Dias', color: 'hsl(var(--primary))' } }}
            className="h-full w-full"
          >
            <LineChart data={timePerStage} margin={{ left: -20, right: 10, top: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="nome"
                axisLine={false}
                tickLine={false}
                className="text-xs text-slate-600"
              />
              <YAxis axisLine={false} tickLine={false} className="text-xs text-slate-600" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                type="monotone"
                dataKey="dias"
                stroke="var(--color-dias)"
                strokeWidth={3}
                dot={{ r: 4, strokeWidth: 2 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-slate-800">Taxa de Aprovação por Vaga (%)</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ChartContainer
            config={{ taxa: { label: 'Aprovação (%)', color: 'hsl(var(--primary))' } }}
            className="h-full w-full"
          >
            <BarChart data={approvalData} margin={{ left: -20, right: 0, top: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="nome"
                axisLine={false}
                tickLine={false}
                className="text-xs text-slate-600"
              />
              <YAxis axisLine={false} tickLine={false} className="text-xs text-slate-600" />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="taxa" fill="var(--color-taxa)" radius={[4, 4, 0, 0]} barSize={32} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  )
}

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type Resultado = string | null | undefined

export function DetailsTable({ candidatos, etapas, vagas, analises }: any) {
  const getBadgeColor = (cand: any, resultado: Resultado) => {
    if (!cand.vaga_id) {
      return 'bg-slate-200 text-slate-600 hover:bg-slate-300 border-none'
    }
    switch (resultado) {
      case 'qualificado':
        return 'bg-green-100 text-green-800 hover:bg-green-200 border-none'
      case 'nao_qualificado':
        return 'bg-red-100 text-red-800 hover:bg-red-200 border-none'
      case 'revisar':
        return 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-none'
      default:
        return 'bg-blue-100 text-blue-800 hover:bg-blue-200 border-none'
    }
  }

  const getResultadoText = (cand: any, resultado: Resultado) => {
    if (!cand.vaga_id) return 'Sem vaga'
    if (!resultado) return 'Pendente'
    switch (resultado) {
      case 'qualificado':
        return 'Qualificado'
      case 'nao_qualificado':
        return 'Não Qualificado'
      case 'revisar':
        return 'Revisar'
      default:
        return 'Pendente'
    }
  }

  const getAnaliseResultado = (cand: any) => {
    const analise = analises.find(
      (a: any) => a.candidato_id === cand.id && (a.vaga_id === cand.vaga_id || !a.vaga_id),
    )
    return analise?.resultado
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-slate-800">Detalhamento de Candidatos</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">Candidato</TableHead>
              <TableHead className="min-w-[150px]">Vaga</TableHead>
              <TableHead className="min-w-[150px]">Etapa Atual</TableHead>
              <TableHead className="min-w-[150px]">Data de Entrada</TableHead>
              <TableHead className="min-w-[120px]">Análise IA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {candidatos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-slate-500 py-8">
                  Nenhum candidato encontrado com os filtros atuais.
                </TableCell>
              </TableRow>
            ) : (
              candidatos.map((cand: any) => {
                const vaga = vagas.find((v: any) => v.id === cand.vaga_id)
                const etapa = etapas.find((e: any) => e.id === cand.etapa_id)
                const resultado = getAnaliseResultado(cand)

                return (
                  <TableRow key={cand.id}>
                    <TableCell className="font-medium text-slate-900">{cand.nome}</TableCell>
                    <TableCell className="text-slate-600">{vaga?.titulo || '-'}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`${etapa?.cor || 'bg-slate-100 text-slate-800'} border-none`}
                      >
                        {etapa?.nome || '-'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {cand.criado_em
                        ? format(parseISO(cand.criado_em), "dd 'de' MMM, yyyy", { locale: ptBR })
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getBadgeColor(cand, resultado)}>
                        {getResultadoText(cand, resultado)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

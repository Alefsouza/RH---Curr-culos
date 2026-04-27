import { VagaComEstatisticas } from '@/services/vagas'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Edit, Trash2, Users, CheckCircle2, XCircle, HelpCircle } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface VagasListProps {
  vagas: VagaComEstatisticas[]
  onEdit: (vaga: VagaComEstatisticas) => void
  onDelete: (vaga: VagaComEstatisticas) => void
}

export function VagasList({ vagas, onEdit, onDelete }: VagasListProps) {
  const renderEstatisticas = (est: VagaComEstatisticas['estatisticas']) => (
    <div className="flex items-center gap-3 text-sm">
      <div className="flex items-center gap-1 text-slate-600" title="Total analisados">
        <Users className="h-4 w-4" /> {est.total}
      </div>
      <div className="flex items-center gap-1 text-emerald-600" title="Qualificados">
        <CheckCircle2 className="h-4 w-4" /> {est.qualificados}
      </div>
      <div className="flex items-center gap-1 text-rose-600" title="Não qualificados">
        <XCircle className="h-4 w-4" /> {est.naoQualificados}
      </div>
      <div className="flex items-center gap-1 text-amber-600" title="Revisar manualmente">
        <HelpCircle className="h-4 w-4" /> {est.revisar}
      </div>
    </div>
  )

  return (
    <>
      <div className="hidden md:block rounded-md border border-slate-200 bg-white overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Vaga</TableHead>
              <TableHead>Criada em</TableHead>
              <TableHead>Análises (Tot / Qual / Ñ Qual / Rev)</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vagas.map((vaga) => (
              <TableRow key={vaga.id}>
                <TableCell className="font-medium text-slate-800">
                  <div className="flex flex-col">
                    <span>{vaga.titulo}</span>
                    {vaga.descricao && (
                      <span className="text-xs text-slate-500 font-normal truncate max-w-[300px]">
                        {vaga.descricao}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-slate-600">
                  {format(new Date(vaga.criado_em), "dd 'de' MMM, yyyy", { locale: ptBR })}
                </TableCell>
                <TableCell>{renderEstatisticas(vaga.estatisticas)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="icon" onClick={() => onEdit(vaga)} title="Editar">
                      <Edit className="h-4 w-4 text-slate-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(vaga)}
                      title="Excluir"
                      className="hover:text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="md:hidden space-y-4 pb-20">
        {vagas.map((vaga) => (
          <Card key={vaga.id} className="overflow-hidden">
            <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50">
              <CardTitle className="text-base text-slate-800">{vaga.titulo}</CardTitle>
              <p className="text-xs text-slate-500">
                {format(new Date(vaga.criado_em), "dd 'de' MMM, yyyy", { locale: ptBR })}
              </p>
            </CardHeader>
            <CardContent className="py-4">
              {vaga.descricao && (
                <p className="text-sm text-slate-600 mb-4 line-clamp-2">{vaga.descricao}</p>
              )}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Estatísticas de Análise
                </p>
                {renderEstatisticas(vaga.estatisticas)}
              </div>
            </CardContent>
            <CardFooter className="pt-0 flex justify-end gap-2 border-t border-slate-100 p-4">
              <Button variant="outline" size="sm" onClick={() => onEdit(vaga)}>
                <Edit className="h-4 w-4 mr-2" /> Editar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDelete(vaga)}
                className="text-rose-600 border-rose-200 hover:bg-rose-50"
              >
                <Trash2 className="h-4 w-4 mr-2" /> Excluir
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </>
  )
}

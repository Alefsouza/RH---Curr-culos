import { useState } from 'react'
import { VagaComEstatisticas, vagasService } from '@/services/vagas'
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
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Edit, Trash2, Users, CheckCircle2, XCircle, HelpCircle, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'

interface VagasListProps {
  vagas: VagaComEstatisticas[]
  onEdit: (vaga: VagaComEstatisticas) => void
  onDelete: (vaga: VagaComEstatisticas) => void
  onToggleAtiva?: (vagaId: string, novaAtiva: boolean) => void
}

export function VagasList({ vagas, onEdit, onDelete, onToggleAtiva }: VagasListProps) {
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const handleToggle = async (vaga: VagaComEstatisticas, nextValue: boolean) => {
    try {
      setTogglingId(vaga.id)
      await vagasService.toggleAtiva(vaga.id, nextValue)
      toast.success(
        nextValue
          ? `Vaga "${vaga.titulo}" ativada! Novos currículos serão avaliados contra ela.`
          : `Vaga "${vaga.titulo}" desativada. Novos currículos não serão avaliados contra ela.`,
      )
      onToggleAtiva?.(vaga.id, nextValue)
    } catch (err: any) {
      toast.error('Erro ao alterar status da vaga: ' + err.message)
    } finally {
      setTogglingId(null)
    }
  }
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
              <TableHead>Status IA</TableHead>
              <TableHead>Criada em</TableHead>
              <TableHead>Análises (Tot / Qual / Ñ Qual / Rev)</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vagas.map((vaga) => {
              const isAtiva = (vaga as any).ativa ?? true
              const isBusy = togglingId === vaga.id

              return (
                <TableRow
                  key={vaga.id}
                  className={!isAtiva ? 'bg-slate-50/60 opacity-80' : undefined}
                >
                  <TableCell className="font-medium text-slate-800">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{vaga.titulo}</span>
                      </div>
                      {vaga.descricao && (
                        <span className="text-xs text-slate-500 font-normal truncate max-w-[300px]">
                          {vaga.descricao}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      {isBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                      ) : (
                        <Switch
                          checked={isAtiva}
                          disabled={isBusy}
                          onCheckedChange={(checked) => handleToggle(vaga, checked)}
                          aria-label={`Status da vaga ${vaga.titulo}`}
                        />
                      )}
                      {isAtiva ? (
                        <Badge
                          variant="outline"
                          className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-medium"
                        >
                          Ativa
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-slate-100 text-slate-600 border-slate-300 text-xs font-medium"
                        >
                          Desativada
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-600 text-sm">
                    {format(new Date(vaga.criado_em), "dd 'de' MMM, yyyy", { locale: ptBR })}
                  </TableCell>
                  <TableCell>{renderEstatisticas(vaga.estatisticas)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(vaga)}
                        title="Editar"
                      >
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
              )
            })}
          </TableBody>
        </Table>
      </div>

      <div className="md:hidden space-y-4 pb-20">
        {vagas.map((vaga) => {
          const isAtiva = (vaga as any).ativa ?? true
          const isBusy = togglingId === vaga.id

          return (
            <Card
              key={vaga.id}
              className={`overflow-hidden ${!isAtiva ? 'bg-slate-50/60 border-slate-200' : ''}`}
            >
              <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50 flex flex-row items-start justify-between space-y-0">
                <div className="space-y-1">
                  <CardTitle className="text-base text-slate-800">{vaga.titulo}</CardTitle>
                  <p className="text-xs text-slate-500">
                    {format(new Date(vaga.criado_em), "dd 'de' MMM, yyyy", { locale: ptBR })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  ) : (
                    <Switch
                      checked={isAtiva}
                      disabled={isBusy}
                      onCheckedChange={(checked) => handleToggle(vaga, checked)}
                      aria-label={`Status da vaga ${vaga.titulo}`}
                    />
                  )}
                  {isAtiva ? (
                    <Badge
                      variant="outline"
                      className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs"
                    >
                      Ativa
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="bg-slate-100 text-slate-600 border-slate-300 text-xs"
                    >
                      Desativada
                    </Badge>
                  )}
                </div>
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
          )
        })}
      </div>
    </>
  )
}

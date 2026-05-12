import { Link } from 'react-router-dom'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, Trash2, Edit, FileText, ExternalLink } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

const statusColors: Record<string, string> = {
  qualificado: 'bg-green-100 text-green-800 hover:bg-green-200',
  nao_qualificado: 'bg-red-100 text-red-800 hover:bg-red-200',
  revisar: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200',
  pendente: 'bg-slate-100 text-slate-800 hover:bg-slate-200',
}

const statusLabels: Record<string, string> = {
  qualificado: 'Qualificado',
  nao_qualificado: 'Não Qualificado',
  revisar: 'Revisar',
  pendente: 'Pendente',
}

export function CandidateTable({
  candidates,
  onEdit,
  onDelete,
  onToggleStatus,
}: {
  candidates: any[]
  onEdit: (c: any) => void
  onDelete: (id: string) => void
  onToggleStatus: (id: string, status: string | null, vagaId: string | null) => void
}) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  const ActionMenu = ({ candidate }: { candidate: any }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link to={`/candidato/${candidate.id}`} className="flex items-center cursor-pointer">
            <ExternalLink className="mr-2 h-4 w-4" /> Detalhes
          </Link>
        </DropdownMenuItem>
        {candidate.curriculo_url && (
          <DropdownMenuItem asChild>
            <a
              href={candidate.curriculo_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center cursor-pointer"
            >
              <FileText className="mr-2 h-4 w-4" /> Ver Currículo
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => onEdit(candidate)} className="cursor-pointer">
          <Edit className="mr-2 h-4 w-4" /> Editar
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onDelete(candidate.id)}
          className="cursor-pointer text-red-600 focus:text-red-600"
        >
          <Trash2 className="mr-2 h-4 w-4" /> Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <>
      {/* Desktop Table */}
      <div className="hidden md:block rounded-xl border bg-white overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Vaga</TableHead>
              <TableHead>Etapa</TableHead>
              <TableHead>Qualificado</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {candidates.map((c) => (
              <TableRow key={c.id} className="hover:bg-slate-50/50">
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium text-slate-900">{c.nome}</span>
                    <span className="text-xs text-slate-500">{c.email}</span>
                  </div>
                  {c.duplicado_de && (
                    <Badge
                      variant="secondary"
                      className="mt-1 text-[10px] bg-amber-100 text-amber-800 border-amber-200"
                    >
                      Duplicado
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-slate-600">{c.vaga}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-normal bg-slate-50">
                    {c.etapa}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={c.status_analise_cv === 'pre_aprovado'}
                      onCheckedChange={() => onToggleStatus(c.id, c.status_analise_cv, c.vaga_id)}
                    />
                    <span className="text-xs text-slate-500">
                      {c.status_analise_cv === 'pre_aprovado'
                        ? 'Sim'
                        : c.status_analise_cv === 'reprovado'
                          ? 'Não'
                          : '-'}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-slate-500">{formatDate(c.criado_em)}</TableCell>
                <TableCell>
                  <ActionMenu candidate={c} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Cards */}
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {candidates.map((c) => (
          <Card key={c.id} className="bg-white shadow-sm border-border">
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-slate-900">{c.nome}</h3>
                  <p className="text-xs text-slate-500">{c.email}</p>
                  {c.duplicado_de && (
                    <Badge
                      variant="secondary"
                      className="mt-1 text-[10px] bg-amber-100 text-amber-800 border-amber-200"
                    >
                      Duplicado
                    </Badge>
                  )}
                </div>
                <ActionMenu candidate={c} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm border-t border-border pt-3">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Vaga</p>
                  <p className="truncate font-medium text-slate-700">{c.vaga}</p>
                </div>
                <div className="flex flex-col">
                  <p className="text-xs text-slate-500 mb-1">Qualificado</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Switch
                      checked={c.status_analise_cv === 'pre_aprovado'}
                      onCheckedChange={() => onToggleStatus(c.id, c.status_analise_cv, c.vaga_id)}
                    />
                    <span className="text-xs text-slate-500">
                      {c.status_analise_cv === 'pre_aprovado'
                        ? 'Sim'
                        : c.status_analise_cv === 'reprovado'
                          ? 'Não'
                          : '-'}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}

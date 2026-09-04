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
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  MoreVertical,
  Trash2,
  Edit,
  FileText,
  ExternalLink,
  Wand2,
  Loader2,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { useState, useRef, useEffect } from 'react'
import { Check, Pencil, X as CloseIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  updateCandidateNome,
  updateCandidateVaga,
  reanalyzeCandidateEdge,
} from '@/services/candidates'
import { toast } from 'sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

function StatusBadge({ status }: { status: string | null }) {
  if (status === 'retirado_kanban') {
    return (
      <Badge
        variant="secondary"
        className="bg-amber-100 text-amber-800 border-amber-300 font-medium whitespace-nowrap"
      >
        Retirado Kanban
      </Badge>
    )
  }
  if (status === 'revisar') {
    return (
      <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
        Revisar
      </Badge>
    )
  }
  if (status === 'qualificado') {
    return (
      <Badge variant="secondary" className="bg-green-100 text-green-800">
        Sim
      </Badge>
    )
  }
  if (status === 'nao_qualificado') {
    return (
      <Badge variant="secondary" className="bg-red-100 text-red-800">
        Não
      </Badge>
    )
  }
  if (status === 'pendente' || !status) {
    return null
  }
  return <span className="text-xs text-slate-500">-</span>
}

export function CandidateTable({
  candidates,
  vagas = [],
  totalCount = 0,
  page = 1,
  pageSize = 30,
  onPageChange,
  onPageSizeChange,
  onEdit,
  onDelete,
  onToggleStatus,
  onRefresh,
  onUpdateCandidateLocal,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  dateSortOrder,
  onToggleDateSort,
}: {
  candidates: any[]
  vagas?: { id: string; titulo: string; ativa?: boolean }[]
  totalCount?: number
  page?: number
  pageSize?: number
  onPageChange?: (page: number) => void
  onPageSizeChange?: (size: number) => void
  onEdit: (c: any) => void
  onDelete: (id: string) => void
  onToggleStatus: (id: string, status: string | null, vagaId: string | null) => void
  onRefresh?: () => void
  onUpdateCandidateLocal?: (candidateId: string, updates: Partial<any>) => void
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  onToggleSelectAll?: () => void
  dateSortOrder?: 'desc' | 'asc' | null
  onToggleDateSort?: () => void
}) {
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set())
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [nameInputValue, setNameInputValue] = useState('')
  const [savingNameId, setSavingNameId] = useState<string | null>(null)
  const [savingVagaId, setSavingVagaId] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingNameId && nameInputRef.current) {
      nameInputRef.current.focus()
      nameInputRef.current.select()
    }
  }, [editingNameId])

  const startEditingName = (c: any) => {
    setEditingNameId(c.id)
    setNameInputValue(c.nome || '')
  }

  const cancelEditingName = () => {
    setEditingNameId(null)
    setNameInputValue('')
  }

  const handleSaveName = async (candidateId: string, currentName: string) => {
    const trimmed = nameInputValue.trim()
    if (!trimmed) {
      toast.error('O nome não pode ficar vazio.')
      return
    }

    if (trimmed === currentName) {
      setEditingNameId(null)
      return
    }

    setSavingNameId(candidateId)
    try {
      await updateCandidateNome(candidateId, trimmed)
      toast.success('Nome atualizado com sucesso!')
      if (onUpdateCandidateLocal) {
        onUpdateCandidateLocal(candidateId, { nome: trimmed })
      }
      setEditingNameId(null)
      onRefresh?.()
    } catch (error: any) {
      console.error('Erro ao atualizar nome:', error)
      toast.error(error?.message || 'Erro ao atualizar nome do candidato.')
    } finally {
      setSavingNameId(null)
    }
  }

  const handleVagaChange = async (
    candidateId: string,
    newVagaId: string,
    currentVagaId: string | null,
  ) => {
    const resolvedVagaId = newVagaId === 'none' ? null : newVagaId
    if (resolvedVagaId === currentVagaId) return

    setSavingVagaId(candidateId)
    try {
      await updateCandidateVaga(candidateId, resolvedVagaId)
      const selectedVaga = vagas.find((v) => v.id === resolvedVagaId)
      const newVagaTitle = selectedVaga ? selectedVaga.titulo : 'Sem vaga'

      toast.success('Vaga atualizada com sucesso!')
      if (onUpdateCandidateLocal) {
        onUpdateCandidateLocal(candidateId, { vaga_id: resolvedVagaId, vaga: newVagaTitle })
      }
      onRefresh?.()
    } catch (error: any) {
      console.error('Erro ao atualizar vaga:', error)
      toast.error(error?.message || 'Erro ao atualizar vaga do candidato.')
    } finally {
      setSavingVagaId(null)
    }
  }

  const allSelected = candidates.length > 0 && candidates.every((c) => selectedIds?.has(c.id))
  const someSelected = candidates.some((c) => selectedIds?.has(c.id))
  const headerChecked: boolean | 'indeterminate' = allSelected
    ? true
    : someSelected
      ? 'indeterminate'
      : false

  const handleReanalyze = async (candidate: any) => {
    if (!candidate.curriculo_url) {
      toast.error('Este candidato não possui currículo anexado.')
      return
    }

    setAnalyzingIds((prev) => new Set(prev).add(candidate.id))

    try {
      await reanalyzeCandidateEdge(candidate.id)
      toast.success('Reanálise concluída com sucesso!')
      if (onRefresh) onRefresh()
      else window.location.reload()
    } catch (error: any) {
      console.error(error)
      const errorMessage = error?.message || 'Erro ao processar análise. Tente novamente.'
      toast.error(errorMessage)
    } finally {
      setAnalyzingIds((prev) => {
        const next = new Set(prev)
        next.delete(candidate.id)
        return next
      })
    }
  }

  const handleViewResume = async (candidate: any) => {
    if (!candidate.curriculo_url) {
      toast.error('Este candidato não possui currículo anexado.')
      return
    }

    try {
      new URL(candidate.curriculo_url)
    } catch {
      toast.error('O caminho do currículo é inválido.')
      return
    }

    try {
      const response = await fetch(candidate.curriculo_url, { method: 'HEAD' })
      if (response.status === 404 || response.status === 400) {
        toast.error(
          'O arquivo do currículo não foi encontrado no servidor. Por favor, faça o upload novamente.',
        )
        return
      }
      if (!response.ok) {
        toast.error('Não foi possível acessar o currículo no momento. Tente novamente.')
        return
      }
      window.open(candidate.curriculo_url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      window.open(candidate.curriculo_url, '_blank', 'noopener,noreferrer')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  const ActionMenu = ({ candidate }: { candidate: any }) => {
    const isAnalyzing = analyzingIds.has(candidate.id)
    const canReanalyze = !!candidate.curriculo_url

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            {isAnalyzing ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <MoreVertical className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link to={`/candidato/${candidate.id}`} className="flex items-center cursor-pointer">
              <ExternalLink className="mr-2 h-4 w-4" /> Detalhes
            </Link>
          </DropdownMenuItem>
          {candidate.curriculo_url && (
            <DropdownMenuItem
              onClick={() => handleViewResume(candidate)}
              className="flex items-center cursor-pointer"
            >
              <FileText className="mr-2 h-4 w-4" /> Ver Currículo
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => {
              if (!isAnalyzing && canReanalyze) {
                handleReanalyze(candidate)
              }
            }}
            className="cursor-pointer"
            disabled={!canReanalyze || isAnalyzing}
          >
            {isAnalyzing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="mr-2 h-4 w-4" />
            )}
            Reanalisar com IA
          </DropdownMenuItem>
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
  }

  return (
    <>
      {/* Desktop Table */}
      <div className="hidden md:block rounded-xl border bg-white overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="w-[48px]">
                <Checkbox
                  checked={headerChecked}
                  onCheckedChange={() => onToggleSelectAll?.()}
                  aria-label="Selecionar todos"
                />
              </TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Vaga</TableHead>
              <TableHead>Etapa</TableHead>
              <TableHead>Qualificado</TableHead>
              <TableHead>
                <button
                  type="button"
                  onClick={onToggleDateSort}
                  className="inline-flex items-center gap-1.5 font-medium text-slate-700 hover:text-slate-900 transition-colors cursor-pointer select-none -ml-1 px-1 py-0.5 rounded hover:bg-slate-200/60"
                  title="Clique para ordenar por data"
                >
                  <span>Data</span>
                  {dateSortOrder === 'asc' && (
                    <ArrowUp
                      className="h-3.5 w-3.5 text-primary stroke-[2.5]"
                      aria-label="Ordenação crescente"
                    />
                  )}
                  {dateSortOrder === 'desc' && (
                    <ArrowDown
                      className="h-3.5 w-3.5 text-primary stroke-[2.5]"
                      aria-label="Ordenação decrescente"
                    />
                  )}
                </button>
              </TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {candidates.map((c) => (
              <TableRow key={c.id} className="hover:bg-slate-50/50">
                <TableCell>
                  <Checkbox
                    checked={selectedIds?.has(c.id) ?? false}
                    onCheckedChange={() => onToggleSelect?.(c.id)}
                    aria-label={`Selecionar ${c.nome}`}
                  />
                </TableCell>
                <TableCell className="max-w-[280px]">
                  <div className="flex flex-col">
                    {editingNameId === c.id ? (
                      <div className="flex items-center gap-1.5 py-1">
                        <Input
                          ref={nameInputRef}
                          value={nameInputValue}
                          disabled={savingNameId === c.id}
                          onChange={(e) => setNameInputValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleSaveName(c.id, c.nome)
                            } else if (e.key === 'Escape') {
                              cancelEditingName()
                            }
                          }}
                          className="h-8 text-sm px-2 py-1 font-medium text-slate-900 bg-white"
                          placeholder="Nome do candidato"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={savingNameId === c.id}
                          onClick={() => handleSaveName(c.id, c.nome)}
                          className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 shrink-0"
                          title="Salvar (Enter)"
                        >
                          {savingNameId === c.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={savingNameId === c.id}
                          onClick={cancelEditingName}
                          className="h-8 w-8 text-slate-400 hover:text-slate-600 shrink-0"
                          title="Cancelar (Esc)"
                        >
                          <CloseIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="group/name flex items-center gap-1.5">
                        <span
                          onClick={() => startEditingName(c)}
                          title="Clique para editar o nome"
                          className="font-medium text-slate-900 hover:text-primary cursor-pointer truncate transition-colors"
                        >
                          {c.nome}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => startEditingName(c)}
                          className="h-6 w-6 opacity-0 group-hover/name:opacity-100 transition-opacity text-slate-400 hover:text-slate-700 shrink-0"
                          title="Editar nome"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        {analyzingIds.has(c.id) && (
                          <Badge
                            variant="secondary"
                            className="h-5 text-[10px] px-1.5 animate-pulse bg-blue-100 text-blue-800"
                          >
                            Processando...
                          </Badge>
                        )}
                      </div>
                    )}
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
                <TableCell className="min-w-[180px] max-w-[240px]">
                  <div className="flex items-center gap-1.5">
                    <Select
                      value={c.vaga_id || 'none'}
                      disabled={savingVagaId === c.id}
                      onValueChange={(val) => handleVagaChange(c.id, val, c.vaga_id)}
                    >
                      <SelectTrigger className="h-8 text-xs bg-white border-slate-200 hover:bg-slate-50/80 transition-colors w-full">
                        <SelectValue placeholder="Selecionar vaga" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="text-xs text-slate-500 italic">
                          Sem vaga
                        </SelectItem>
                        {vagas.map((vaga) => (
                          <SelectItem key={vaga.id} value={vaga.id} className="text-xs">
                            <span className="flex items-center gap-1.5">
                              <span>{vaga.titulo}</span>
                              {vaga.ativa === false && (
                                <span className="text-[10px] text-slate-400 font-normal">
                                  (desativada)
                                </span>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {savingVagaId === c.id && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-normal bg-slate-50">
                    {c.etapa}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={c.status_analise === 'qualificado'}
                      onCheckedChange={() => onToggleStatus(c.id, c.status_analise, c.vaga_id)}
                    />
                    <StatusBadge status={c.status_analise} />
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
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={selectedIds?.has(c.id) ?? false}
                    onCheckedChange={() => onToggleSelect?.(c.id)}
                    aria-label={`Selecionar ${c.nome}`}
                  />
                  <div className="flex-1 min-w-0">
                    {editingNameId === c.id ? (
                      <div className="flex items-center gap-1.5 my-1">
                        <Input
                          ref={nameInputRef}
                          value={nameInputValue}
                          disabled={savingNameId === c.id}
                          onChange={(e) => setNameInputValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleSaveName(c.id, c.nome)
                            } else if (e.key === 'Escape') {
                              cancelEditingName()
                            }
                          }}
                          className="h-8 text-sm px-2 py-1 font-semibold text-slate-900 bg-white"
                          placeholder="Nome do candidato"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={savingNameId === c.id}
                          onClick={() => handleSaveName(c.id, c.nome)}
                          className="h-8 w-8 text-emerald-600 hover:text-emerald-700 shrink-0"
                          title="Salvar"
                        >
                          {savingNameId === c.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={savingNameId === c.id}
                          onClick={cancelEditingName}
                          className="h-8 w-8 text-slate-400 hover:text-slate-600 shrink-0"
                          title="Cancelar"
                        >
                          <CloseIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <h3
                          onClick={() => startEditingName(c)}
                          className="font-semibold text-slate-900 hover:text-primary cursor-pointer truncate transition-colors flex items-center gap-2"
                        >
                          {c.nome}
                        </h3>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => startEditingName(c)}
                          className="h-6 w-6 text-slate-400 hover:text-slate-700 shrink-0"
                          title="Editar nome"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        {analyzingIds.has(c.id) && (
                          <Badge
                            variant="secondary"
                            className="h-5 text-[10px] px-1.5 animate-pulse bg-blue-100 text-blue-800"
                          >
                            Processando...
                          </Badge>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-slate-500 truncate">{c.email}</p>
                    {c.duplicado_de && (
                      <Badge
                        variant="secondary"
                        className="mt-1 text-[10px] bg-amber-100 text-amber-800 border-amber-200"
                      >
                        Duplicado
                      </Badge>
                    )}
                  </div>
                </div>
                <ActionMenu candidate={c} />
              </div>
              <div className="space-y-2 text-sm border-t border-border pt-3">
                <div>
                  <p className="text-xs text-slate-500 mb-1 font-medium">Vaga</p>
                  <div className="flex items-center gap-1.5">
                    <Select
                      value={c.vaga_id || 'none'}
                      disabled={savingVagaId === c.id}
                      onValueChange={(val) => handleVagaChange(c.id, val, c.vaga_id)}
                    >
                      <SelectTrigger className="h-8 text-xs bg-white border-slate-200 hover:bg-slate-50/80 transition-colors w-full">
                        <SelectValue placeholder="Selecionar vaga" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none" className="text-xs text-slate-500 italic">
                          Sem vaga
                        </SelectItem>
                        {vagas.map((vaga) => (
                          <SelectItem key={vaga.id} value={vaga.id} className="text-xs">
                            <span className="flex items-center gap-1.5">
                              <span>{vaga.titulo}</span>
                              {vaga.ativa === false && (
                                <span className="text-[10px] text-slate-400 font-normal">
                                  (desativada)
                                </span>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {savingVagaId === c.id && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Etapa</p>
                    <Badge variant="outline" className="font-normal bg-slate-50 text-xs">
                      {c.etapa}
                    </Badge>
                  </div>
                  <div className="flex flex-col items-end">
                    <p className="text-xs text-slate-500 mb-1">Qualificado</p>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={c.status_analise === 'qualificado'}
                        onCheckedChange={() => onToggleStatus(c.id, c.status_analise, c.vaga_id)}
                      />
                      <StatusBadge status={c.status_analise} />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Paginação */}
      {totalCount > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 px-1">
          <div className="text-sm text-slate-500 order-2 sm:order-1">
            Mostrando{' '}
            <span className="font-medium text-slate-700">
              {Math.min((page - 1) * pageSize + 1, totalCount)}
            </span>{' '}
            a{' '}
            <span className="font-medium text-slate-700">
              {Math.min(page * pageSize, totalCount)}
            </span>{' '}
            de <span className="font-medium text-slate-700">{totalCount}</span> candidatos
          </div>

          <div className="flex flex-wrap items-center gap-4 sm:gap-6 order-1 sm:order-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500 whitespace-nowrap">Itens por página:</span>
              <Select
                value={String(pageSize)}
                onValueChange={(val) => onPageSizeChange?.(Number(val))}
              >
                <SelectTrigger className="h-8 w-[72px] bg-white">
                  <SelectValue placeholder={String(pageSize)} />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="30">30</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange?.(page - 1)}
                disabled={page <= 1}
                className="h-8 px-2.5 bg-white text-slate-700"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Anterior
              </Button>
              <div className="text-xs font-medium text-slate-600 px-2">
                Página {page} de {Math.max(1, Math.ceil(totalCount / pageSize))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange?.(page + 1)}
                disabled={page >= Math.ceil(totalCount / pageSize)}
                className="h-8 px-2.5 bg-white text-slate-700"
              >
                Próxima
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

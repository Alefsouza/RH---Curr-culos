import React from 'react'
import { Candidate } from '@/types/kanban'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Mail,
  Phone,
  GripVertical,
  ExternalLink,
  Trash2,
  CheckCircle,
  XCircle,
  Users,
  MapPin,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { removeFromKanban } from '@/services/kanban'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface KanbanCardProps {
  candidate: Candidate
  isDragging: boolean
  isSelected?: boolean
  onToggleSelect?: (id: string) => void
  onDragStart: (id: string) => void
  onDragEnd: () => void
}

const sourceColors: Record<string, string> = {
  outlook_import: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
  Outlook: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
  site_form: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200',
  Site: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200',
  manual_upload: 'bg-purple-100 text-purple-700 hover:bg-purple-200',
  Cato: 'bg-orange-100 text-orange-700 hover:bg-orange-200',
}

const sourceLabels: Record<string, string> = {
  outlook_import: 'Via Outlook',
  site_form: 'Site',
  manual_upload: 'Manual',
}

export function KanbanCard({
  candidate,
  isDragging,
  isSelected = false,
  onToggleSelect,
  onDragStart,
  onDragEnd,
}: KanbanCardProps) {
  const { toast } = useToast()
  const [showRemoveDialog, setShowRemoveDialog] = React.useState(false)
  const [isRemoving, setIsRemoving] = React.useState(false)

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', candidate.id)
    e.dataTransfer.effectAllowed = 'move'
    // Small delay to allow the drag image to be generated before we dim the original
    setTimeout(() => onDragStart(candidate.id), 0)
  }

  const handleOpenRemoveDialog = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setShowRemoveDialog(true)
  }

  const handleConfirmRemove = async () => {
    setIsRemoving(true)
    try {
      await removeFromKanban(candidate.id, (candidate as any).vagaId)
      toast({
        title: 'Candidato retirado do Kanban',
        description:
          'O candidato continua disponível em Candidatos com o status "Retirado Kanban".',
      })
      window.dispatchEvent(
        new CustomEvent('kanban:delete-candidate', { detail: { candidateId: candidate.id } }),
      )
      setShowRemoveDialog(false)
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao retirar do Kanban',
        description: err?.message || 'Tente novamente.',
      })
    } finally {
      setIsRemoving(false)
    }
  }

  const formattedSource = candidate.source
    ? sourceLabels[candidate.source] ||
      candidate.source.charAt(0).toUpperCase() + candidate.source.slice(1).toLowerCase()
    : 'Outro'

  const formattedAderencia = candidate.analysisDetails?.aderencia
    ? String(candidate.analysisDetails.aderencia).charAt(0).toUpperCase() +
      String(candidate.analysisDetails.aderencia).slice(1)
    : null

  return (
    <Card
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'group relative cursor-grab active:cursor-grabbing border bg-white opacity-100',
        isSelected
          ? 'border-primary bg-primary/[0.02] ring-2 ring-primary/20 shadow-sm'
          : 'border-border',
        'transition-[box-shadow,border-color,opacity,background-color] duration-200 ease-out will-change-[box-shadow,border-color]',
        'hover:border-primary/40 hover:shadow-elevation hover:opacity-95',
        isDragging && 'opacity-90 shadow-elevation border-primary/40 ring-1 ring-primary/10',
      )}
    >
      <div
        className={cn(
          'absolute left-2 top-1/2 -translate-y-1/2 text-slate-300 transition-opacity',
          isDragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
      >
        <GripVertical size={16} />
      </div>

      <div className="absolute left-2.5 top-2.5 z-10 flex items-center">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation()
            onToggleSelect?.(candidate.id)
          }}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer transition-all"
          title={isSelected ? 'Desmarcar candidato' : 'Selecionar candidato'}
        />
      </div>

      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <Button
          variant="ghost"
          size="icon"
          title="Retirar do Kanban"
          className="h-6 w-6 text-slate-400 hover:text-red-600 hover:bg-red-50"
          onClick={handleOpenRemoveDialog}
        >
          <Trash2 size={14} />
        </Button>
      </div>
      <CardContent className="p-4 pl-8 space-y-3">
        <div className="pr-4">
          <h4 className="font-semibold text-slate-800 leading-tight hover:text-primary transition-colors">
            <Link
              to={`/candidato/${candidate.id}`}
              state={{ from: 'kanban' }}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center justify-between group/link"
            >
              <span>{candidate.name}</span>
              <ExternalLink className="w-3 h-3 opacity-0 group-hover/link:opacity-100 transition-opacity" />
            </Link>
          </h4>
          <p className="text-xs text-slate-500 font-medium truncate">{candidate.job}</p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center text-xs text-slate-500">
            <Mail className="mr-2 h-3.5 w-3.5" />
            <span className="truncate">{candidate.email}</span>
          </div>
          <div className="flex items-center text-xs text-slate-500">
            <Phone className="mr-2 h-3.5 w-3.5" />
            <span className="truncate">{candidate.phone}</span>
            {candidate.phone && candidate.phone.includes(',') && (
              <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-blue-600 font-medium bg-blue-50 px-1 py-0 rounded">
                <Users className="w-2.5 h-2.5" />
                {candidate.phone.split(',').filter(Boolean).length} números
              </span>
            )}
          </div>
          {candidate.proximidade === 'cursino' && (
            <div className="flex items-center">
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200/60 rounded px-1.5 py-0.5">
                <MapPin className="h-3 w-3 text-amber-600" />
                Próximo à Cursino
              </span>
            </div>
          )}
          {candidate.proximidade === 'sapopemba' && (
            <div className="flex items-center">
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-700 bg-sky-50 border border-sky-200/60 rounded px-1.5 py-0.5">
                <MapPin className="h-3 w-3 text-sky-600" />
                Próxima à Sapopemba
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1">
            <Badge
              variant="secondary"
              className={cn(
                'text-[10px] font-semibold px-2 py-0',
                sourceColors[candidate.source] ||
                  sourceColors[formattedSource] ||
                  'bg-slate-100 text-slate-700 hover:bg-slate-200',
              )}
            >
              {formattedSource}
            </Badge>
            {formattedAderencia && (
              <Badge
                variant="outline"
                className="text-[10px] font-medium px-1.5 py-0 bg-blue-50 text-blue-700 border-blue-200 shadow-none"
              >
                {formattedAderencia}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {(candidate as any).ultima_resposta_whatsapp && (
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] font-medium px-1 py-0 shadow-none border gap-0.5 flex items-center h-4',
                  (candidate as any).ultima_resposta_whatsapp === 'sim'
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : 'bg-red-50 text-red-700 border-red-200',
                )}
              >
                {(candidate as any).ultima_resposta_whatsapp === 'sim' ? (
                  <CheckCircle className="w-2.5 h-2.5" />
                ) : (
                  <XCircle className="w-2.5 h-2.5" />
                )}
                {(candidate as any).ultima_resposta_whatsapp === 'sim' ? 'Sim' : 'Não'}
              </Badge>
            )}
            <span className="text-[10px] text-slate-400">
              {new Date(candidate.appliedAt).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: 'short',
              })}
            </span>
          </div>
        </div>
      </CardContent>

      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirar candidato do Kanban?</AlertDialogTitle>
            <AlertDialogDescription>
              O candidato <strong className="text-slate-800">{candidate.name}</strong> deixará de
              aparecer no Kanban e sua qualificação será definida como{' '}
              <strong className="text-slate-800">Retirado Kanban</strong>.
              <br />
              <br />
              Ele <span className="font-semibold text-emerald-600">continuará disponível</span> na
              página de Candidatos e poderá voltar ao Kanban a qualquer momento ao mudar sua
              qualificação para <strong>Sim</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isRemoving}
              onClick={(e) => {
                e.preventDefault()
                handleConfirmRemove()
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white focus:ring-amber-600"
            >
              {isRemoving ? 'Retirando...' : 'Retirar do Kanban'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

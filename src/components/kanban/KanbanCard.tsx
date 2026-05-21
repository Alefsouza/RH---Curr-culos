import React from 'react'
import { Candidate } from '@/types/kanban'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Mail, Phone, GripVertical, ExternalLink, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { deleteCandidate } from '@/services/kanban'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface KanbanCardProps {
  candidate: Candidate
  isDragging: boolean
  onDragStart: (id: string) => void
  onDragEnd: () => void
}

const sourceColors: Record<string, string> = {
  Outlook: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
  Cato: 'bg-orange-100 text-orange-700 hover:bg-orange-200',
  Site: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200',
}

export function KanbanCard({ candidate, isDragging, onDragStart, onDragEnd }: KanbanCardProps) {
  const { toast } = useToast()

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', candidate.id)
    e.dataTransfer.effectAllowed = 'move'
    // Small delay to allow the drag image to be generated before we dim the original
    setTimeout(() => onDragStart(candidate.id), 0)
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Deseja excluir este currículo do Kanban?')) return
    try {
      await deleteCandidate(candidate.id)
      toast({ title: 'Currículo excluído com sucesso.' })
      window.dispatchEvent(
        new CustomEvent('kanban:delete-candidate', { detail: { candidateId: candidate.id } }),
      )
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro ao excluir currículo. Tente novamente.' })
    }
  }

  const formattedSource = candidate.source
    ? candidate.source.charAt(0).toUpperCase() + candidate.source.slice(1).toLowerCase()
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
        'group relative cursor-grab active:cursor-grabbing border-border hover:border-primary/30 hover:shadow-elevation hover:opacity-80 opacity-100 transition-all duration-200 bg-white',
        isDragging && '!opacity-90 scale-95 shadow-elevation',
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
      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-slate-400 hover:text-red-600 hover:bg-red-50"
          onClick={handleDelete}
        >
          <Trash2 size={14} />
        </Button>
      </div>
      <CardContent className="p-4 pl-7 space-y-3">
        <div className="pr-4">
          <h4 className="font-semibold text-slate-800 leading-tight hover:text-primary transition-colors">
            <Link
              to={`/candidato/${candidate.id}`}
              onClick={(e) => e.stopPropagation()}
              target="_blank"
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
            <span>{candidate.phone}</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1">
            <Badge
              variant="secondary"
              className={cn(
                'text-[10px] font-semibold px-2 py-0',
                sourceColors[formattedSource] || 'bg-slate-100 text-slate-700 hover:bg-slate-200',
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
          <span className="text-[10px] text-slate-400">
            {new Date(candidate.appliedAt).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: 'short',
            })}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

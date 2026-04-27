import React from 'react'
import { Candidate } from '@/types/kanban'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Mail, Phone, GripVertical } from 'lucide-react'
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
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', candidate.id)
    e.dataTransfer.effectAllowed = 'move'
    // Small delay to allow the drag image to be generated before we dim the original
    setTimeout(() => onDragStart(candidate.id), 0)
  }

  return (
    <Card
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'group relative cursor-grab active:cursor-grabbing border-slate-200 hover:border-slate-300 hover:shadow-md transition-all duration-200 bg-white',
        isDragging && 'opacity-50 scale-95 shadow-lg rotate-2',
      )}
    >
      <div className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical size={16} />
      </div>
      <CardContent className="p-4 pl-7 space-y-3">
        <div>
          <h4 className="font-semibold text-slate-800 leading-tight">{candidate.name}</h4>
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
          <Badge
            variant="secondary"
            className={cn(
              'text-[10px] font-semibold px-2 py-0',
              sourceColors[candidate.source] || 'bg-slate-100 text-slate-700 hover:bg-slate-200',
            )}
          >
            {candidate.source || 'Outro'}
          </Badge>
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

import { Button } from '@/components/ui/button'
import { Wand2, Trash2, X, Loader2 } from 'lucide-react'

export function BulkActionBar({
  count,
  onReanalyze,
  onDelete,
  onClear,
  isReanalyzing,
}: {
  count: number
  onReanalyze: () => void
  onDelete: () => void
  onClear: () => void
  isReanalyzing?: boolean
}) {
  if (count === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in-up">
      <div className="flex items-center gap-2 bg-slate-900 text-white rounded-full shadow-2xl px-4 py-2.5 border border-slate-700">
        <span className="text-sm font-medium whitespace-nowrap px-2">
          {count} candidato{count !== 1 ? 's' : ''} selecionado{count !== 1 ? 's' : ''}
        </span>
        <div className="h-5 w-px bg-slate-700" />
        <Button
          size="sm"
          onClick={onReanalyze}
          disabled={isReanalyzing}
          className="bg-primary hover:bg-primary/90 text-white rounded-full h-8 gap-1.5"
        >
          {isReanalyzing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Wand2 className="h-3.5 w-3.5" />
          )}
          Reanalisar com IA
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-full h-8 gap-1.5"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Excluir
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClear}
          className="text-slate-400 hover:text-white hover:bg-slate-700 rounded-full h-8 w-8 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

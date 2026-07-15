import { Button } from '@/components/ui/button'
import { Trash2, Wand2, X, Loader2 } from 'lucide-react'

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
  isReanalyzing: boolean
}) {
  if (count === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in-up">
      <div className="flex items-center gap-3 bg-slate-900 text-white rounded-xl shadow-2xl px-5 py-3 border border-slate-700">
        <span className="text-sm font-medium whitespace-nowrap">
          {count} {count === 1 ? 'candidato selecionado' : 'candidatos selecionados'}
        </span>
        <div className="h-5 w-px bg-white/20" />
        <Button
          size="sm"
          variant="secondary"
          onClick={onReanalyze}
          disabled={isReanalyzing}
          className="bg-white/10 hover:bg-white/20 text-white border-0"
        >
          {isReanalyzing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="mr-2 h-4 w-4" />
          )}
          Reanalisar com IA
        </Button>
        <Button size="sm" variant="destructive" onClick={onDelete} disabled={isReanalyzing}>
          <Trash2 className="mr-2 h-4 w-4" />
          Excluir
        </Button>
        <button
          onClick={onClear}
          disabled={isReanalyzing}
          className="text-sm text-white/70 hover:text-white flex items-center gap-1 ml-1 transition-colors disabled:opacity-50"
        >
          <X className="h-4 w-4" />
          Limpar seleção
        </button>
      </div>
    </div>
  )
}

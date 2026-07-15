import { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, Briefcase } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VagaSelectDialogProps {
  isOpen: boolean
  vagas: { id: string; titulo: string }[]
  onClose: () => void
  onConfirm: (vagaId: string) => void
}

export function VagaSelectDialog({ isOpen, vagas, onClose, onConfirm }: VagaSelectDialogProps) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setSearch('')
      setSelectedId(null)
    }
  }, [isOpen])

  const filtered = useMemo(() => {
    if (!search) return vagas
    return vagas.filter((v) => v.titulo.toLowerCase().includes(search.toLowerCase()))
  }, [vagas, search])

  const handleConfirm = () => {
    if (!selectedId) return
    onConfirm(selectedId)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Selecionar Vaga</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-slate-500">
            Este candidato não possui vaga associada. Selecione uma vaga para continuar com a
            qualificação.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar vaga..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <ScrollArea className="h-[260px] rounded-md border">
            <div className="p-1">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Briefcase className="h-8 w-8 text-slate-300 mb-2" />
                  <p className="text-sm text-slate-400">Nenhuma vaga encontrada.</p>
                </div>
              ) : (
                filtered.map((vaga) => (
                  <button
                    key={vaga.id}
                    type="button"
                    onClick={() => setSelectedId(vaga.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left text-sm transition-colors',
                      selectedId === vaga.id
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-slate-100 text-slate-700',
                    )}
                  >
                    <Briefcase className="h-4 w-4 shrink-0" />
                    <span className="truncate">{vaga.titulo}</span>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!selectedId}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

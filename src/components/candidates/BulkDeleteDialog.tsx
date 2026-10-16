import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertTriangle, Archive, Loader2 } from 'lucide-react'

interface BulkDeleteDialogProps {
  isOpen: boolean
  count: number
  onClose: () => void
  onConfirm: () => void
  onArchive?: () => void
}

export function BulkDeleteDialog({
  isOpen,
  count,
  onClose,
  onConfirm,
  onArchive,
}: BulkDeleteDialogProps) {
  const [typedConfirm, setTypedConfirm] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)

  const REQUIRED_TEXT = 'EXCLUIR'
  const isMatch = typedConfirm.trim().toUpperCase() === REQUIRED_TEXT

  useEffect(() => {
    if (!isOpen) {
      setTypedConfirm('')
      setIsDeleting(false)
      setIsArchiving(false)
    }
  }, [isOpen])

  const handleConfirm = async () => {
    if (!isMatch || isDeleting) return
    setIsDeleting(true)
    try {
      await onConfirm()
    } finally {
      setIsDeleting(false)
    }
  }

  const handleArchive = async () => {
    if (!onArchive || isArchiving) return
    setIsArchiving(true)
    try {
      await onArchive()
    } finally {
      setIsArchiving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <div className="p-2 bg-red-100 rounded-full text-red-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <DialogTitle className="text-xl text-red-700">Excluir {count} Candidatos</DialogTitle>
          </div>
          <DialogDescription className="text-slate-600 pt-2 text-left">
            Tem certeza que deseja excluir definitivamente os{' '}
            <strong className="text-slate-900">{count}</strong> candidatos selecionados? Esta ação é{' '}
            <span className="font-semibold text-red-600">irreversível</span> e apagará todo o
            histórico, mensagens, respostas e análises de todos eles.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {onArchive && (
            <div className="bg-amber-50/80 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2.5">
              <Archive className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">Recomendação: Arquivar</p>
                <p className="text-amber-800">
                  Arquivar retira os candidatos do Kanban mas preserva todo o histórico de mensagens
                  e observações no banco.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="bulk-delete-confirm" className="text-xs font-semibold text-slate-700">
              Para confirmar a exclusão definitiva em massa, digite{' '}
              <span className="text-red-600 font-bold">{REQUIRED_TEXT}</span>:
            </Label>
            <Input
              id="bulk-delete-confirm"
              value={typedConfirm}
              onChange={(e) => setTypedConfirm(e.target.value)}
              placeholder={`Digite ${REQUIRED_TEXT}`}
              disabled={isDeleting}
              className="h-10 text-sm focus-visible:ring-red-500 uppercase"
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 flex-col sm:flex-row pt-2">
          {onArchive && (
            <Button
              type="button"
              variant="outline"
              onClick={handleArchive}
              disabled={isDeleting || isArchiving}
              className="w-full sm:w-auto border-amber-300 text-amber-800 hover:bg-amber-50 hover:text-amber-900 gap-1.5 sm:mr-auto"
            >
              {isArchiving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
              Arquivar ({count})
            </Button>
          )}

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isDeleting || isArchiving}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirm}
              disabled={!isMatch || isDeleting || isArchiving}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Excluindo...
                </>
              ) : (
                `Excluir Definitivamente (${count})`
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

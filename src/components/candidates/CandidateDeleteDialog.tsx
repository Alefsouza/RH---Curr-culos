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
import {
  AlertTriangle,
  Loader2,
  MessageSquare,
  Clock,
  Briefcase,
  FileText,
  Archive,
} from 'lucide-react'
import { getCandidateDeletionImpact, type CandidateDeletionImpact } from '@/services/candidates'

interface CandidateDeleteDialogProps {
  isOpen: boolean
  candidateId: string | null
  candidateName?: string | null
  onClose: () => void
  onConfirm: () => void
  onArchive?: () => void
}

export function CandidateDeleteDialog({
  isOpen,
  candidateId,
  candidateName: propCandidateName,
  onClose,
  onConfirm,
  onArchive,
}: CandidateDeleteDialogProps) {
  const [typedName, setTypedName] = useState('')
  const [loadingImpact, setLoadingImpact] = useState(false)
  const [impact, setImpact] = useState<CandidateDeletionImpact | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)

  useEffect(() => {
    if (isOpen && candidateId) {
      setTypedName('')
      setIsDeleting(false)
      setIsArchiving(false)
      setLoadingImpact(true)
      getCandidateDeletionImpact(candidateId)
        .then((res) => {
          setImpact(res)
        })
        .catch((err) => {
          console.error('Erro ao buscar impacto de exclusão:', err)
          setImpact(null)
        })
        .finally(() => {
          setLoadingImpact(false)
        })
    } else {
      setImpact(null)
      setTypedName('')
      setIsDeleting(false)
      setIsArchiving(false)
    }
  }, [isOpen, candidateId])

  const expectedName = (impact?.candidatoNome || propCandidateName || '').trim()
  const isNameMatch =
    expectedName.length > 0 &&
    typedName.trim().localeCompare(expectedName, undefined, { sensitivity: 'accent' }) === 0

  const handleConfirmDelete = async () => {
    if (!isNameMatch || isDeleting) return
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
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <div className="p-2 bg-red-100 rounded-full text-red-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <DialogTitle className="text-xl text-red-700">
              Excluir Candidato Definitivamente
            </DialogTitle>
          </div>
          <DialogDescription className="text-slate-600 pt-2 text-left">
            Esta ação é <span className="font-semibold text-red-600">irreversível</span>. O
            candidato <strong className="text-slate-900">{expectedName || 'selecionado'}</strong> e
            todo o seu histórico serão completamente apagados do banco de dados.
          </DialogDescription>
        </DialogHeader>

        {loadingImpact ? (
          <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-sm">Calculando dados que serão perdidos...</span>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="bg-red-50/80 border border-red-200 rounded-lg p-3.5 space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-red-800">
                O que será permanentemente apagado:
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-700">
                <div className="flex items-center gap-1.5 bg-white/70 p-2 rounded border border-red-100">
                  <MessageSquare className="h-3.5 w-3.5 text-red-600 shrink-0" />
                  <span>
                    <strong>{impact?.mensagensWhatsapp ?? 0}</strong> mensagens WhatsApp
                  </span>
                </div>
                <div className="flex items-center gap-1.5 bg-white/70 p-2 rounded border border-red-100">
                  <MessageSquare className="h-3.5 w-3.5 text-red-600 shrink-0" />
                  <span>
                    <strong>{impact?.respostasWhatsapp ?? 0}</strong> respostas recebidas
                  </span>
                </div>
                <div className="flex items-center gap-1.5 bg-white/70 p-2 rounded border border-red-100">
                  <Clock className="h-3.5 w-3.5 text-red-600 shrink-0" />
                  <span>
                    <strong>{impact?.historicoEtapas ?? 0}</strong> etapas na timeline
                  </span>
                </div>
                <div className="flex items-center gap-1.5 bg-white/70 p-2 rounded border border-red-100">
                  <FileText className="h-3.5 w-3.5 text-red-600 shrink-0" />
                  <span>
                    <strong>{impact?.observacoes ?? 0}</strong> observações de RH
                  </span>
                </div>
                <div className="col-span-2 flex items-center gap-1.5 bg-white/70 p-2 rounded border border-red-100">
                  <Briefcase className="h-3.5 w-3.5 text-red-600 shrink-0" />
                  <span className="truncate">
                    Vaga: <strong>{impact?.vagaNome || 'Sem vaga'}</strong> | Etapa:{' '}
                    <strong>{impact?.etapaNome || 'Sem etapa'}</strong>
                  </span>
                </div>
              </div>
            </div>

            {onArchive && (
              <div className="bg-amber-50/80 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2.5">
                <Archive className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">Prefere não perder os dados?</p>
                  <p className="text-amber-800">
                    Você pode <strong>Arquivar</strong> o candidato. Ele sai do Kanban mas todo o
                    histórico de mensagens, respostas e observações é preservado.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2 pt-2">
              <Label
                htmlFor="confirm-candidate-name"
                className="text-xs font-semibold text-slate-700"
              >
                Para confirmar a exclusão definitiva, digite o nome completo:{' '}
                <span className="text-red-600 font-bold select-all">{expectedName}</span>
              </Label>
              <Input
                id="confirm-candidate-name"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder={`Digite "${expectedName}"`}
                disabled={isDeleting || loadingImpact}
                className="h-10 text-sm focus-visible:ring-red-500"
                autoComplete="off"
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0 flex-col sm:flex-row pt-2">
          <div className="flex items-center gap-2 w-full sm:w-auto sm:mr-auto">
            {onArchive && (
              <Button
                type="button"
                variant="outline"
                onClick={handleArchive}
                disabled={isDeleting || isArchiving || loadingImpact}
                className="w-full sm:w-auto border-amber-300 text-amber-800 hover:bg-amber-50 hover:text-amber-900 gap-1.5"
              >
                {isArchiving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Archive className="h-4 w-4" />
                )}
                Arquivar em vez de excluir
              </Button>
            )}
          </div>

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
              onClick={handleConfirmDelete}
              disabled={!isNameMatch || isDeleting || isArchiving || loadingImpact}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  Excluindo...
                </>
              ) : (
                'Excluir Definitivamente'
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

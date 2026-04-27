import { useState } from 'react'
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
import { VagaComEstatisticas, vagasService } from '@/services/vagas'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

interface VagaDeleteModalProps {
  isOpen: boolean
  onClose: () => void
  vaga: VagaComEstatisticas | null
  onDeleted: () => void
}

export function VagaDeleteModal({ isOpen, onClose, vaga, onDeleted }: VagaDeleteModalProps) {
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!vaga) return
    try {
      setIsDeleting(true)
      await vagasService.deleteVaga(vaga.id)
      toast.success('Vaga excluída com sucesso!')
      onDeleted()
      onClose()
    } catch (error: any) {
      toast.error('Erro ao excluir vaga: ' + error.message)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir Vaga</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir a vaga <strong>{vaga?.titulo}</strong>? Esta ação não
            pode ser desfeita e os candidatos associados a esta vaga perderão a referência.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              handleDelete()
            }}
            className="bg-rose-600 hover:bg-rose-700 text-white"
            disabled={isDeleting}
          >
            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

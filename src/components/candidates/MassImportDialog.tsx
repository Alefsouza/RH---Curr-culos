import { useState, useRef, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { UploadCloud, FileText, CheckCircle2, XCircle, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { uploadResume, processResume, identifyAndAssignVaga } from '@/services/import'
import { useToast } from '@/hooks/use-toast'

type FileStatus = 'pending' | 'uploading' | 'processing' | 'identifying' | 'success' | 'error'

interface UploadItem {
  id: string
  file: File
  status: FileStatus
  error?: string
  candidateName?: string
}

interface MassImportDialogProps {
  isOpen: boolean
  onClose: () => void
  onComplete: () => void
  userId: string
}

const statusConfig: Record<
  FileStatus,
  { icon: typeof FileText; color: string; label: string; spin?: boolean }
> = {
  pending: { icon: FileText, color: 'text-slate-400', label: 'Aguardando' },
  uploading: { icon: Loader2, color: 'text-blue-500', label: 'Enviando...', spin: true },
  processing: { icon: Loader2, color: 'text-blue-500', label: 'Processando IA...', spin: true },
  identifying: {
    icon: Loader2,
    color: 'text-purple-500',
    label: 'Identificando vaga...',
    spin: true,
  },
  success: { icon: CheckCircle2, color: 'text-green-500', label: 'Concluído' },
  error: { icon: XCircle, color: 'text-red-500', label: 'Erro' },
}

export function MassImportDialog({ isOpen, onClose, onComplete, userId }: MassImportDialogProps) {
  const [items, setItems] = useState<UploadItem[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const handleFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return
    const pdfs = Array.from(fileList).filter((f) => f.type === 'application/pdf')
    const newItems: UploadItem[] = pdfs.map((f) => ({
      id: `${Date.now()}-${Math.random()}`,
      file: f,
      status: 'pending' as FileStatus,
    }))
    setItems((prev) => [...prev, ...newItems])
  }, [])

  const updateItem = (id: string, updates: Partial<UploadItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)))
  }

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  const processFiles = async () => {
    setIsProcessing(true)
    let successCount = 0

    for (const item of items) {
      if (item.status !== 'pending') continue
      try {
        updateItem(item.id, { status: 'uploading' })
        const filePath = await uploadResume(item.file, userId)

        updateItem(item.id, { status: 'processing' })
        const result = await processResume(filePath, userId)

        try {
          updateItem(item.id, { status: 'identifying' })
          if (result.candidato_id) {
            await identifyAndAssignVaga(result.candidato_id, userId)
          }
        } catch {
          // vaga identification failure is non-critical
        }

        updateItem(item.id, {
          status: 'success',
          candidateName: result.dados_extraidos?.nome || item.file.name,
        })
        successCount++
      } catch (err: any) {
        updateItem(item.id, { status: 'error', error: err.message || 'Erro ao processar' })
      }
    }

    setIsProcessing(false)
    if (successCount > 0) {
      toast({ title: `${successCount} candidato(s) importado(s) com sucesso` })
      onComplete()
    }
  }

  const handleClose = () => {
    if (isProcessing) return
    setItems([])
    onClose()
  }

  const pendingCount = items.filter((i) => i.status === 'pending').length

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Importar Currículos</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setIsDragging(false)
              handleFiles(e.dataTransfer.files)
            }}
            onClick={() => !isProcessing && inputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-slate-300 hover:border-primary/50 hover:bg-slate-50',
              isProcessing && 'pointer-events-none opacity-60',
            )}
          >
            <input
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              ref={inputRef}
              onChange={(e) => handleFiles(e.target.files)}
            />
            <UploadCloud className="w-10 h-10 mx-auto text-slate-400 mb-2" />
            <p className="text-sm font-medium text-slate-900">
              Arraste currículos PDF aqui ou clique para selecionar
            </p>
            <p className="text-xs text-slate-500 mt-1">A IA extrairá os dados automaticamente</p>
          </div>

          {items.length > 0 && (
            <ScrollArea className="h-[240px] rounded-md border">
              <div className="p-2 space-y-1">
                {items.map((item) => {
                  const cfg = statusConfig[item.status]
                  const Icon = cfg.icon
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-50"
                    >
                      <Icon
                        className={cn('h-4 w-4 shrink-0', cfg.color, cfg.spin && 'animate-spin')}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {item.file.name}
                        </p>
                        <p className={cn('text-xs', cfg.color)}>{item.error || cfg.label}</p>
                      </div>
                      {!isProcessing && item.status !== 'success' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => removeItem(item.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            Cancelar
          </Button>
          <Button onClick={processFiles} disabled={isProcessing || pendingCount === 0}>
            {isProcessing
              ? 'Processando...'
              : `Importar ${pendingCount} arquivo${pendingCount !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

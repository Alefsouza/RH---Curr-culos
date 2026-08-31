import { useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  FileText,
  Loader2,
  Briefcase,
  ArrowLeft,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { uploadResume, analyzeResumePublic, identifyAndAssignVaga } from '@/services/import'

type FileStatus = 'pending' | 'uploading' | 'processing' | 'identifying' | 'success' | 'error'

interface UploadItem {
  id: string
  file: File
  status: FileStatus
  error?: string
  candidateName?: string
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
  error: { icon: AlertCircle, color: 'text-red-500', label: 'Erro' },
}

const MAX_SIZE = 5 * 1024 * 1024

export default function ApplyPage() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const [items, setItems] = useState<UploadItem[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [completed, setCompleted] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const validateFile = (file: File): string | null => {
    if (file.type !== 'application/pdf') return 'Apenas arquivos PDF são permitidos.'
    if (file.size > MAX_SIZE) return 'O arquivo deve ter no máximo 5MB.'
    return null
  }

  const handleFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return
    const newItems: UploadItem[] = []
    for (const file of Array.from(fileList)) {
      const err = validateFile(file)
      if (err) {
        setErrorMsg(err)
        continue
      }
      newItems.push({
        id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
        file,
        status: 'pending',
      })
    }
    if (newItems.length > 0) setErrorMsg('')
    setItems((prev) => [...prev, ...newItems])
  }, [])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  const updateItem = (id: string, updates: Partial<UploadItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)))
  }

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  const handleSubmit = async () => {
    if (items.length === 0) {
      setErrorMsg('Por favor, anexe pelo menos um currículo.')
      return
    }
    if (!userId) {
      setErrorMsg('Link de candidatura inválido (User ID não encontrado).')
      return
    }

    setIsProcessing(true)

    for (const item of items) {
      if (item.status !== 'pending') continue
      try {
        updateItem(item.id, { status: 'uploading' })
        const filePath = await uploadResume(item.file, userId)

        updateItem(item.id, { status: 'processing' })
        const result = await analyzeResumePublic(filePath, userId)

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
          candidateName: result.candidato_nome || result.dados_extraidos?.nome || item.file.name,
        })
      } catch (err: any) {
        console.error('Erro no processamento do currículo:', err)
        updateItem(item.id, {
          status: 'error',
          error: err.message || 'Erro ao processar o currículo',
        })
      }
    }

    setIsProcessing(false)
    setCompleted(true)
  }

  const handleReset = () => {
    setItems([])
    setCompleted(false)
    setErrorMsg('')
  }

  const successCount = items.filter((i) => i.status === 'success').length
  const errorCount = items.filter((i) => i.status === 'error').length
  const totalCount = items.length
  const progressValue =
    totalCount > 0 ? Math.round(((successCount + errorCount) / totalCount) * 100) : 0

  if (completed) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-lg mb-4 flex justify-start">
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-600 hover:text-slate-900"
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Voltar
          </Button>
        </div>
        <Card className="w-full max-w-lg border-green-100 shadow-lg animate-fade-in-up">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl text-green-800">
              {successCount > 0
                ? `${successCount} currículo(s) recebido(s) com sucesso!`
                : 'Processamento concluído'}
            </CardTitle>
            <CardDescription className="text-base">
              {successCount > 0
                ? 'Agradecemos o seu interesse. Nossa IA extraiu os dados e as candidaturas foram enviadas à equipe de recrutamento.'
                : 'Nenhum currículo foi processado com sucesso. Tente novamente.'}
            </CardDescription>
          </CardHeader>
          {errorCount > 0 && (
            <CardContent className="pb-2">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {errorCount} arquivo(s) não puderam ser processados.
              </div>
            </CardContent>
          )}
          <CardContent className="mt-4">
            <Button className="w-full" variant="outline" onClick={handleReset}>
              Enviar Novos Currículos
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl flex flex-col gap-6">
        <div className="flex items-center justify-start">
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-600 hover:text-slate-900"
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Voltar
          </Button>
        </div>

        <div className="text-center animate-fade-in-down">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-primary rounded-2xl mb-4 text-primary-foreground shadow-lg shadow-primary/20">
            <Briefcase className="w-7 h-7" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
            Trabalhe Conosco
          </h1>
          <p className="text-slate-500 mt-2 text-base md:text-lg">
            Envie seu currículo e participe de nossos processos seletivos.
          </p>
        </div>

        <Card className="border-slate-200 shadow-xl shadow-slate-200/50 bg-white/50 backdrop-blur-sm animate-fade-in-up">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Envie seu Currículo</CardTitle>
            <CardDescription>
              Carregue um ou mais currículos e nossa IA identificará seus dados automaticamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-red-800 text-sm animate-fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{errorMsg}</p>
              </div>
            )}

            {isProcessing && (
              <div className="space-y-2 animate-fade-in">
                <div className="flex justify-between text-xs text-slate-500 font-medium">
                  <span>
                    Processando {successCount + errorCount} de {totalCount}...
                  </span>
                  <span>{progressValue}%</span>
                </div>
                <Progress value={progressValue} className="h-2.5 bg-slate-100" />
              </div>
            )}

            <div className="space-y-3">
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                onClick={() => !isProcessing && fileInputRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 group',
                  isDragging
                    ? 'border-primary bg-primary/5 scale-[1.01]'
                    : 'border-slate-300 hover:border-primary/50 hover:bg-slate-50',
                  isProcessing && 'pointer-events-none opacity-60',
                )}
              >
                <input
                  type="file"
                  accept="application/pdf"
                  multiple
                  className="hidden"
                  ref={fileInputRef}
                  onChange={(e) => {
                    handleFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 mb-1 group-hover:scale-110 transition-transform group-hover:bg-primary/10 group-hover:text-primary">
                    <UploadCloud className="w-7 h-7" />
                  </div>
                  <p className="text-sm font-medium text-slate-900">
                    Arraste seus currículos aqui ou clique para selecionar
                  </p>
                  <p className="text-xs text-slate-500">Formato PDF, máximo 5MB por arquivo</p>
                </div>
              </div>
            </div>

            {items.length > 0 && (
              <ScrollArea className="h-[200px] rounded-md border">
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
                        {!isProcessing && item.status === 'pending' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
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

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:items-center gap-3 pt-2 border-t border-slate-100">
              <Button
                type="button"
                size="lg"
                className="sm:w-auto px-8 h-11 text-base w-full"
                onClick={handleSubmit}
                disabled={isProcessing || items.length === 0}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processando...
                  </>
                ) : (
                  `Enviar ${items.length > 0 ? `${items.length} ` : ''}Currículo${items.length !== 1 ? 's' : ''}`
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

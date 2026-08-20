import React, { createContext, useContext, useState, useRef, useCallback } from 'react'
import { reanalyzeCandidateEdge } from '@/services/candidates'
import { useToast } from '@/hooks/use-toast'

export type CandidateProcessStatus = 'pending' | 'processing' | 'success' | 'error' | 'cancelled'

export interface BulkCandidateItem {
  id: string
  nome: string
  vaga?: string
  status: CandidateProcessStatus
  error?: string
  resultado?: string
}

export interface BulkReanalysisProgress {
  total: number
  processed: number
  successCount: number
  errorCount: number
  cancelledCount: number
  currentBatch: number
  totalBatches: number
  percent: number
}

export interface CandidateToReanalyze {
  id: string
  nome: string
  vaga?: string
  curriculo_url?: string | null
}

interface BulkReanalysisContextType {
  isProcessing: boolean
  isCancelling: boolean
  isMinimized: boolean
  isExpanded: boolean
  progress: BulkReanalysisProgress
  statuses: BulkCandidateItem[]
  startReanalysis: (candidates: CandidateToReanalyze[]) => void
  cancelReanalysis: () => void
  setIsExpanded: (expanded: boolean) => void
  toggleExpanded: () => void
  dismissBar: () => void
}

const BulkReanalysisContext = createContext<BulkReanalysisContextType | undefined>(undefined)

const BATCH_SIZE = 5
const MAX_RETRIES = 2
const RETRY_BASE_DELAY = 1000 // 1s exponential backoff

class CancellationError extends Error {
  constructor(message = 'Cancelado pelo usuário') {
    super(message)
    this.name = 'CancellationError'
  }
}

/**
 * Espera `ms` milissegundos verificando periodicamente (a cada 50ms) se o cancelamento foi solicitado.
 * Se cancelado durante o delay, resolve imediatamente ou lança para abortar o delay.
 */
async function interruptibleSleep(ms: number, isCancelled: () => boolean): Promise<boolean> {
  const step = 50
  let elapsed = 0
  while (elapsed < ms) {
    if (isCancelled()) {
      return false // foi interrompido/cancelado
    }
    const chunk = Math.min(step, ms - elapsed)
    await new Promise((resolve) => setTimeout(resolve, chunk))
    elapsed += chunk
  }
  return !isCancelled()
}

async function processWithRetry(
  candidateId: string,
  isCancelled: () => boolean,
  maxRetries = MAX_RETRIES,
): Promise<any> {
  let attempt = 0
  let lastError: any = null

  while (attempt <= maxRetries) {
    if (isCancelled()) {
      throw new CancellationError()
    }

    try {
      const res = await reanalyzeCandidateEdge(candidateId)
      return res
    } catch (err: any) {
      if (isCancelled()) {
        throw new CancellationError()
      }
      lastError = err
      attempt++
      if (attempt <= maxRetries) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt - 1)
        const completed = await interruptibleSleep(delay, isCancelled)
        if (!completed || isCancelled()) {
          throw new CancellationError()
        }
      }
    }
  }

  throw lastError
}

export function BulkReanalysisProvider({ children }: { children: React.ReactNode }) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [statuses, setStatuses] = useState<BulkCandidateItem[]>([])
  const [currentBatch, setCurrentBatch] = useState(0)
  const [totalBatches, setTotalBatches] = useState(0)

  const cancelRequestedRef = useRef(false)
  const isRunningRef = useRef(false)
  const { toast } = useToast()

  const dismissBar = useCallback(() => {
    if (!isRunningRef.current) {
      setIsMinimized(true)
      setIsExpanded(false)
    }
  }, [])

  const cancelReanalysis = useCallback(() => {
    if (!isRunningRef.current) return
    cancelRequestedRef.current = true
    setIsCancelling(true)
  }, [])

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev)
  }, [])

  const startReanalysis = useCallback(
    async (candidates: CandidateToReanalyze[]) => {
      // Se já está processando, avisar
      if (isRunningRef.current) {
        toast({
          variant: 'destructive',
          title: 'Processamento em andamento',
          description: 'Já existe uma reanálise em massa sendo executada no momento.',
        })
        return
      }

      const valid = candidates.filter((c) => !!c.curriculo_url)
      const invalid = candidates.filter((c) => !c.curriculo_url)

      if (valid.length === 0) {
        toast({
          variant: 'destructive',
          title: 'Não foi possível reanalisar',
          description:
            'Nenhum dos candidatos selecionados possui currículo anexado. Verifique e tente novamente.',
        })
        return
      }

      if (invalid.length > 0) {
        toast({
          title: 'Candidatos sem currículo',
          description: `${invalid.length} candidato(s) sem currículo serão pulados da análise.`,
        })
      }

      const initialItems: BulkCandidateItem[] = valid.map((c) => ({
        id: c.id,
        nome: c.nome,
        vaga: c.vaga,
        status: 'pending',
      }))

      setStatuses(initialItems)
      setIsProcessing(true)
      setIsCancelling(false)
      setIsMinimized(false)
      setIsExpanded(false)
      cancelRequestedRef.current = false
      isRunningRef.current = true

      const batches: BulkCandidateItem[][] = []
      for (let i = 0; i < initialItems.length; i += BATCH_SIZE) {
        batches.push(initialItems.slice(i, i + BATCH_SIZE))
      }

      setTotalBatches(batches.length)
      setCurrentBatch(1)

      let totalSuccess = 0
      let totalErrors = 0
      let wasCancelled = false

      const checkCancelled = () => cancelRequestedRef.current

      for (let bIndex = 0; bIndex < batches.length; bIndex++) {
        // Verificar se cancelamento foi solicitado antes de iniciar o lote
        if (cancelRequestedRef.current) {
          wasCancelled = true
          break
        }

        const batch = batches[bIndex]
        setCurrentBatch(bIndex + 1)

        // Marca todos os itens do lote atual como 'processing'
        setStatuses((prev) =>
          prev.map((item) =>
            batch.some((b) => b.id === item.id) ? { ...item, status: 'processing' } : item,
          ),
        )

        // Processa as chamadas do lote atual em paralelo com retry e interrupção imediata
        await Promise.allSettled(
          batch.map(async (candidate) => {
            if (cancelRequestedRef.current) {
              setStatuses((prev) =>
                prev.map((item) =>
                  item.id === candidate.id
                    ? {
                        ...item,
                        status: 'cancelled',
                        error: 'Cancelado pelo usuário',
                      }
                    : item,
                ),
              )
              return
            }

            try {
              const res = await processWithRetry(candidate.id, checkCancelled)
              const analiseResultado =
                res?.data?.data?.analise?.resultado ||
                res?.data?.analise?.resultado ||
                res?.analise?.resultado ||
                'qualificado'

              setStatuses((prev) =>
                prev.map((item) =>
                  item.id === candidate.id
                    ? {
                        ...item,
                        status: 'success',
                        resultado: analiseResultado,
                      }
                    : item,
                ),
              )
              totalSuccess++
            } catch (err: any) {
              if (err instanceof CancellationError || cancelRequestedRef.current) {
                setStatuses((prev) =>
                  prev.map((item) =>
                    item.id === candidate.id
                      ? {
                          ...item,
                          status: 'cancelled',
                          error: 'Cancelado pelo usuário',
                        }
                      : item,
                  ),
                )
                return
              }

              const errorMsg =
                err?.message || err?.details || 'Erro ao processar análise do candidato.'

              setStatuses((prev) =>
                prev.map((item) =>
                  item.id === candidate.id
                    ? {
                        ...item,
                        status: 'error',
                        error: errorMsg,
                      }
                    : item,
                ),
              )
              totalErrors++
            }
          }),
        )

        // Se após o lote o cancelamento foi solicitado
        if (cancelRequestedRef.current) {
          wasCancelled = true
          break
        }
      }

      if (cancelRequestedRef.current) {
        wasCancelled = true
        // Marcar candidatos restantes como 'cancelled'
        setStatuses((prev) =>
          prev.map((item) =>
            item.status === 'pending' || item.status === 'processing'
              ? { ...item, status: 'cancelled', error: 'Cancelado pelo usuário' }
              : item,
          ),
        )
      }

      isRunningRef.current = false
      setIsProcessing(false)
      setIsCancelling(false)

      if (wasCancelled) {
        toast({
          variant: 'default',
          title: 'Processamento cancelado',
          description: `Processamento cancelado. ${totalSuccess} processados com sucesso, ${totalErrors} falha(s).`,
        })
      } else {
        if (totalErrors === 0) {
          toast({
            title: 'Reanálise em massa concluída com sucesso!',
            description: `${totalSuccess} candidato(s) reanalisados com sucesso.`,
          })
        } else {
          toast({
            variant: totalSuccess > 0 ? 'default' : 'destructive',
            title: 'Reanálise finalizada',
            description: `${totalSuccess} processados com sucesso, ${totalErrors} falha(s).`,
          })
        }
      }
    },
    [toast],
  )

  const total = statuses.length
  const successCount = statuses.filter((i) => i.status === 'success').length
  const errorCount = statuses.filter((i) => i.status === 'error').length
  const cancelledCount = statuses.filter((i) => i.status === 'cancelled').length
  const processed = successCount + errorCount + cancelledCount
  const percent = total > 0 ? Math.round((processed / total) * 100) : 0

  const progress: BulkReanalysisProgress = {
    total,
    processed,
    successCount,
    errorCount,
    cancelledCount,
    currentBatch,
    totalBatches,
    percent,
  }

  return (
    <BulkReanalysisContext.Provider
      value={{
        isProcessing,
        isCancelling,
        isMinimized,
        isExpanded,
        progress,
        statuses,
        startReanalysis,
        cancelReanalysis,
        setIsExpanded,
        toggleExpanded,
        dismissBar,
      }}
    >
      {children}
    </BulkReanalysisContext.Provider>
  )
}

export function useBulkReanalysis() {
  const context = useContext(BulkReanalysisContext)
  if (!context) {
    throw new Error('useBulkReanalysis deve ser usado dentro de um BulkReanalysisProvider')
  }
  return context
}

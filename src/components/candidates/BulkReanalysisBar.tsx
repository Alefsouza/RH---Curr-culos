import { useBulkReanalysis } from '@/contexts/BulkReanalysisContext'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export function BulkReanalysisBar() {
  const {
    isProcessing,
    isMinimized,
    isExpanded,
    progress,
    statuses,
    cancelReanalysis,
    setIsExpanded,
    toggleExpanded,
    dismissBar,
  } = useBulkReanalysis()

  // Se não há candidatos ou foi minimizado/descartado e não está processando, não mostra nada
  if (statuses.length === 0 || (isMinimized && !isProcessing)) {
    return null
  }

  const { total, processed, successCount, errorCount, currentBatch, totalBatches, percent } =
    progress

  return (
    <>
      {/* Popover / Drawer detalhado ancorado acima da barra */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-end justify-center p-0 sm:pb-14 transition-all animate-in fade-in duration-200"
          onClick={() => setIsExpanded(false)}
        >
          <div
            className="w-full sm:max-w-xl bg-white border border-slate-200 rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 max-h-[85vh] flex flex-col space-y-4 animate-in slide-in-from-bottom-6 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho */}
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    Reanálise de Candidatos com IA
                  </h3>
                  <p className="text-xs text-slate-500">
                    Processamento em lotes de 5 por vez em segundo plano.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {isProcessing && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={cancelReanalysis}
                    className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                  >
                    <X className="h-3.5 w-3.5 mr-1" />
                    Cancelar
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-slate-400 hover:text-slate-700"
                  onClick={() => setIsExpanded(false)}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Overview / Card de Progresso */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="font-semibold text-slate-800 flex items-center gap-2">
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      Processando lote {currentBatch} de {totalBatches}...
                    </>
                  ) : (
                    'Processamento finalizado'
                  )}
                </span>
                <span className="font-bold text-slate-700">
                  {processed} / {total} ({percent}%)
                </span>
              </div>

              <Progress value={percent} className="h-2.5 w-full bg-slate-200" />

              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                <div className="bg-white rounded-lg p-2 border border-slate-100 shadow-xs">
                  <span className="block text-[11px] text-slate-500">Concluídos</span>
                  <span className="text-sm font-bold text-slate-800">{processed}</span>
                </div>
                <div className="bg-white rounded-lg p-2 border border-emerald-100 shadow-xs">
                  <span className="block text-[11px] text-emerald-600 font-medium">Sucesso</span>
                  <span className="text-sm font-bold text-emerald-600">{successCount}</span>
                </div>
                <div className="bg-white rounded-lg p-2 border border-red-100 shadow-xs">
                  <span className="block text-[11px] text-red-600 font-medium">Falhas</span>
                  <span className="text-sm font-bold text-red-600">{errorCount}</span>
                </div>
              </div>
            </div>

            {/* Lista rolável de candidatos */}
            <div className="space-y-1.5 flex-1 min-h-0 flex flex-col">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600 uppercase tracking-wider">
                <span>Status dos candidatos ({total})</span>
                {isProcessing && (
                  <span className="text-[11px] text-slate-400 font-normal lowercase">
                    aguardando Edge Functions...
                  </span>
                )}
              </div>

              <ScrollArea className="flex-1 max-h-[220px] rounded-xl border border-slate-200 bg-white shadow-inner p-1">
                <div className="space-y-1.5 p-1">
                  {statuses.map((item, idx) => (
                    <div
                      key={item.id}
                      className={cn(
                        'flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs sm:text-sm transition-colors',
                        item.status === 'processing' &&
                          'bg-blue-50/70 border-blue-200 text-blue-900',
                        item.status === 'success' &&
                          'bg-emerald-50/50 border-emerald-200 text-slate-900',
                        item.status === 'error' && 'bg-red-50/50 border-red-200 text-slate-900',
                        item.status === 'pending' &&
                          'bg-slate-50/60 border-slate-100 text-slate-500',
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <span className="text-[11px] font-mono text-slate-400 w-5 shrink-0">
                          #{idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium truncate text-xs sm:text-sm">{item.nome}</p>
                          {item.vaga && (
                            <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">
                              {item.vaga}
                            </p>
                          )}
                          {item.error && (
                            <p className="text-[10px] sm:text-[11px] text-red-600 truncate mt-0.5">
                              {item.error}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-1.5 pl-2">
                        {item.status === 'pending' && (
                          <span className="inline-flex items-center text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
                            Na fila
                          </span>
                        )}

                        {item.status === 'processing' && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full font-medium">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Analisando...
                          </span>
                        )}

                        {item.status === 'success' && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full font-medium">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            {item.resultado ? item.resultado.toUpperCase() : 'OK'}
                          </span>
                        )}

                        {item.status === 'error' && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-red-700 bg-red-100 px-2 py-0.5 rounded-full font-medium">
                            <XCircle className="h-3 w-3 text-red-600" />
                            Falha
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {!isProcessing && errorCount > 0 && (
              <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>{errorCount} candidato(s) com erro na análise.</span>
              </div>
            )}

            {/* Rodapé do popover */}
            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-[11px] text-slate-500">
                {isProcessing
                  ? 'Você pode navegar por outras páginas durante a reanálise.'
                  : 'Reanálise finalizada.'}
              </span>
              <div className="flex items-center gap-2">
                {!isProcessing && (
                  <Button size="sm" variant="outline" onClick={dismissBar} className="h-8 text-xs">
                    Dispensar
                  </Button>
                )}
                <Button size="sm" onClick={() => setIsExpanded(false)} className="h-8 text-xs">
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Barra flutuante minimalista fixa no rodapé */}
      <div className="fixed bottom-0 left-0 right-0 z-50 select-none">
        {/* Barra de progresso ultrafina (2.5px) no topo */}
        <div className="h-[3px] w-full bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 via-primary to-emerald-400 transition-all duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Corpo da barra: fundo slate-900, altura ~48px */}
        <div
          onClick={toggleExpanded}
          className="h-12 bg-slate-900 text-white border-t border-slate-800/80 px-4 flex items-center justify-between cursor-pointer hover:bg-slate-850 transition-colors shadow-2xl"
          role="button"
          tabIndex={0}
          title="Clique para ver detalhes do progresso"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              toggleExpanded()
            }
          }}
        >
          {/* Lado esquerdo / Centro: Indicador em tempo real */}
          <div className="flex items-center gap-2.5 sm:gap-3 text-xs sm:text-sm truncate">
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin text-blue-400 shrink-0" />
            ) : errorCount > 0 ? (
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            )}

            <div className="flex items-center gap-1.5 sm:gap-2 font-medium truncate">
              <span className="font-semibold text-white tracking-wide">
                {processed}/{total}
              </span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-300">
                Lote {currentBatch}/{totalBatches}
              </span>
              <span className="text-slate-500">•</span>
              <span>{isProcessing ? '⏳' : '✅'}</span>
              <span className="hidden md:inline text-xs text-slate-400 ml-2">
                ({percent}% concluído)
              </span>
            </div>
          </div>

          {/* Lado direito: Botões de ação */}
          <div
            className="flex items-center gap-2 shrink-0 ml-2"
            onClick={(e) => e.stopPropagation()}
          >
            {isProcessing ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={cancelReanalysis}
                className="h-7 text-xs text-red-300 hover:text-red-200 hover:bg-red-900/30 px-2 sm:px-2.5 rounded font-medium"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                <span>✕ Cancelar</span>
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={dismissBar}
                className="h-7 text-xs text-slate-400 hover:text-white hover:bg-slate-800 px-2 sm:px-2.5 rounded font-medium"
                title="Fechar barra"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                <span>Fechar</span>
              </Button>
            )}

            <button
              type="button"
              onClick={toggleExpanded}
              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
              title={isExpanded ? 'Recolher detalhes' : 'Expandir detalhes'}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

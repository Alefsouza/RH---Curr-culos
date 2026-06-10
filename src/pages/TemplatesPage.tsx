import { useState, useEffect } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { MessageSquare, Smartphone, Save, Play, History, Loader2, AlertCircle } from 'lucide-react'
import {
  getEtapasComTemplates,
  saveTemplate,
  testTemplate,
  getMessageHistory,
} from '@/services/templates'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

type TemplateData = {
  tipo: string
  texto: string
  pergunta_texto: string
  botao_sim_texto: string
  botao_sim_acao: string
  botao_nao_texto: string
  botao_nao_acao: string
  etapa_destino_id: string | null
}

export default function TemplatesPage() {
  const [etapas, setEtapas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>('')
  const [templates, setTemplates] = useState<Record<string, TemplateData>>({})
  const [saving, setSaving] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testing, setTesting] = useState(false)
  const [history, setHistory] = useState<any[]>([])
  const { toast } = useToast()

  const defaultTemplate: TemplateData = {
    tipo: 'texto_simples',
    texto: '',
    pergunta_texto: '',
    botao_sim_texto: 'Sim',
    botao_sim_acao: 'manter',
    botao_nao_texto: 'Não',
    botao_nao_acao: 'manter',
    etapa_destino_id: null,
  }

  const loadData = async () => {
    try {
      setLoading(true)
      const data = await getEtapasComTemplates()
      setEtapas(data)
      if (data.length > 0) {
        setActiveTab(data[0].id)
        const temps: Record<string, TemplateData> = {}
        data.forEach((e) => {
          if (e.template) {
            temps[e.id] = {
              tipo: e.template.tipo || 'texto_simples',
              texto: e.template.texto || '',
              pergunta_texto: e.template.pergunta_texto || '',
              botao_sim_texto: e.template.botao_sim_texto || 'Sim',
              botao_sim_acao: e.template.botao_sim_acao || 'manter',
              botao_nao_texto: e.template.botao_nao_texto || 'Não',
              botao_nao_acao: e.template.botao_nao_acao || 'manter',
              etapa_destino_id: e.template.etapa_destino_id || null,
            }
          } else {
            temps[e.id] = { ...defaultTemplate }
          }
        })
        setTemplates(temps)
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar templates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    getMessageHistory().then(setHistory).catch(console.error)
  }, [])

  const updateTemplate = (key: keyof TemplateData, value: string) => {
    setTemplates((prev) => ({
      ...prev,
      [activeTab]: { ...prev[activeTab], [key]: value },
    }))
  }

  const handleSave = async () => {
    if (!activeTab) return
    const data = templates[activeTab]
    try {
      setSaving(true)
      await saveTemplate(activeTab, data)
      toast({ title: 'Sucesso', description: 'Template salvo com sucesso.' })
      await loadData()
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!activeTab) return
    const data = templates[activeTab] || defaultTemplate

    const cleanPhone = testPhone.replace(/\D/g, '')
    if (cleanPhone.length < 10) {
      toast({
        title: 'Erro',
        description: 'Telefone inválido. Digite pelo menos DDD + Número.',
        variant: 'destructive',
      })
      return
    }

    try {
      setTesting(true)
      const res = await testTemplate(testPhone, data)

      if (res && res.error) {
        let errorDesc = res.detalhe
          ? `${res.message}: ${res.detalhe}`
          : res.message || 'Falha no teste'

        if (errorDesc.includes('Timeout') || errorDesc.includes('tempo limite')) {
          errorDesc =
            'O provedor de WhatsApp está demorando para responder. Por favor, tente novamente em alguns instantes.'
        }

        toast({
          title: 'Erro ao Enviar',
          description: errorDesc,
          variant: 'destructive',
        })
      } else {
        const isFallback = res._usedPayloadType === 'fallback'
        toast({
          title: 'Sucesso',
          description: `Mensagem de teste enviada com sucesso.${isFallback ? ' (Enviada como texto simples devido a instabilidade da API)' : ''}`,
        })
      }
    } catch (err: any) {
      let errorMsg = err.message || 'Falha na comunicação com o servidor'
      try {
        const parsed = JSON.parse(err.message)
        if (parsed.detalhe) errorMsg = `${parsed.message}: ${parsed.detalhe}`
        else if (parsed.message) errorMsg = parsed.message
      } catch {
        if (err.detalhe) errorMsg = `${err.message}: ${err.detalhe}`
      }

      if (errorMsg.includes('Timeout') || errorMsg.includes('tempo limite')) {
        errorMsg =
          'O provedor de WhatsApp está demorando para responder. Por favor, tente novamente em alguns instantes.'
      }

      toast({
        title: 'Erro ao Enviar',
        description: errorMsg,
        variant: 'destructive',
      })
    } finally {
      setTesting(false)
    }
  }

  const insertVar = (variable: string) => {
    if (!activeTab) return
    const currentData = templates[activeTab]
    if (currentData.tipo === 'chatbot_interativo') {
      updateTemplate('pergunta_texto', currentData.pergunta_texto + variable)
    } else {
      updateTemplate('texto', currentData.texto + variable)
    }
  }

  const getPreviewText = (text: string) => {
    if (!text) return ''
    return text
      .replace(/{{nome_candidato}}/g, 'João da Silva')
      .replace(/{{nome_vaga}}/g, 'Desenvolvedor Front-end')
  }

  if (loading)
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px]" />
      </div>
    )
  if (error)
    return (
      <div className="p-6 max-w-4xl mx-auto text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
        <p>{error}</p>
        <Button onClick={loadData}>Tentar Novamente</Button>
      </div>
    )
  if (etapas.length === 0)
    return (
      <div className="p-6 max-w-4xl mx-auto text-center py-20">
        <h2 className="text-2xl font-bold">Nenhum template configurado</h2>
      </div>
    )

  const activeData = templates[activeTab] || defaultTemplate

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 animate-fade-in-up">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-blue-600" />
            Templates de Mensagens
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Configure as mensagens automáticas e chatbots interativos.
          </p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2">
              <History className="w-4 h-4" />
              Ver Histórico
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Histórico de Mensagens</DialogTitle>
            </DialogHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Candidato</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>{format(new Date(h.criado_em), 'dd/MM/yy HH:mm')}</TableCell>
                    <TableCell>{h.candidatos?.nome || '-'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={h.status?.startsWith('enviada') ? 'default' : 'destructive'}
                        className={h.status?.startsWith('enviada') ? 'bg-green-500' : ''}
                      >
                        {h.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full flex flex-wrap justify-start h-auto mb-6 bg-transparent p-0 gap-2">
          {etapas.map((etapa) => (
            <TabsTrigger
              key={etapa.id}
              value={etapa.id}
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white bg-white border border-slate-200 text-slate-600 rounded-full px-4 py-2 transition-all"
            >
              {etapa.nome}
            </TabsTrigger>
          ))}
        </TabsList>

        {etapas.map((etapa) => (
          <TabsContent key={etapa.id} value={etapa.id} className="mt-0 outline-none">
            <div className="grid lg:grid-cols-2 gap-6">
              <Card className="shadow-sm border-slate-200">
                <CardHeader className="bg-slate-50 border-b border-slate-100 rounded-t-xl pb-4">
                  <CardTitle className="text-lg">Configuração da Etapa: {etapa.nome}</CardTitle>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  <div className="space-y-3">
                    <Label className="font-semibold">Modo de Mensagem</Label>
                    <RadioGroup
                      value={activeData.tipo}
                      onValueChange={(val) => updateTemplate('tipo', val)}
                      className="flex flex-col gap-3"
                    >
                      <div className="flex items-center space-x-2 border p-3 rounded-lg hover:bg-slate-50 transition-colors">
                        <RadioGroupItem value="texto_simples" id={`r1-${etapa.id}`} />
                        <Label htmlFor={`r1-${etapa.id}`} className="cursor-pointer font-medium">
                          Texto Simples
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2 border p-3 rounded-lg hover:bg-slate-50 transition-colors">
                        <RadioGroupItem value="chatbot_interativo" id={`r2-${etapa.id}`} />
                        <Label htmlFor={`r2-${etapa.id}`} className="cursor-pointer font-medium">
                          Chatbot Interativo (Botões Sim/Não)
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Variáveis Disponíveis
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {['{{nome_candidato}}', '{{nome_vaga}}'].map((v) => (
                        <Badge
                          key={v}
                          variant="secondary"
                          className="cursor-pointer hover:bg-blue-100 transition-colors bg-slate-100"
                          onClick={() => insertVar(v)}
                        >
                          {v}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {activeData.tipo === 'texto_simples' ? (
                    <div className="space-y-2">
                      <Label>Texto da Mensagem</Label>
                      <Textarea
                        className="min-h-[250px] resize-y"
                        placeholder="Olá {{nome_candidato}}..."
                        value={activeData.texto}
                        onChange={(e) => updateTemplate('texto', e.target.value)}
                      />
                    </div>
                  ) : (
                    <div className="space-y-6 animate-fade-in">
                      <div className="space-y-2">
                        <Label>Pergunta Principal</Label>
                        <Textarea
                          className="min-h-[100px] resize-y"
                          placeholder="Você confirma o agendamento da entrevista?"
                          value={activeData.pergunta_texto}
                          onChange={(e) => updateTemplate('pergunta_texto', e.target.value)}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4 bg-green-50/50 p-4 rounded-lg border border-green-100">
                        <div className="space-y-2">
                          <Label className="text-green-700">Botão Positivo (Sim)</Label>
                          <Input
                            value={activeData.botao_sim_texto}
                            maxLength={20}
                            onChange={(e) => updateTemplate('botao_sim_texto', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-green-700">Ação ao clicar</Label>
                          <Select
                            value={activeData.botao_sim_acao}
                            onValueChange={(val) => updateTemplate('botao_sim_acao', val)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="manter">Manter na Etapa</SelectItem>
                              <SelectItem value="mover">Mover para Etapa</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 bg-red-50/50 p-4 rounded-lg border border-red-100">
                        <div className="space-y-2">
                          <Label className="text-red-700">Botão Negativo (Não)</Label>
                          <Input
                            value={activeData.botao_nao_texto}
                            maxLength={20}
                            onChange={(e) => updateTemplate('botao_nao_texto', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-red-700">Ação ao clicar</Label>
                          <Select
                            value={activeData.botao_nao_acao}
                            onValueChange={(val) => updateTemplate('botao_nao_acao', val)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="manter">Manter na Etapa</SelectItem>
                              <SelectItem value="mover">Mover para Etapa</SelectItem>
                              <SelectItem value="remover">Remover do Kanban</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {(activeData.botao_sim_acao === 'mover' ||
                        activeData.botao_nao_acao === 'mover') && (
                        <div className="space-y-2 bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                          <Label>Etapa de Destino (Para a ação "Mover")</Label>
                          <Select
                            value={activeData.etapa_destino_id || ''}
                            onValueChange={(val) => updateTemplate('etapa_destino_id', val)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione a etapa" />
                            </SelectTrigger>
                            <SelectContent>
                              {etapas
                                .filter((e) => e.id !== etapa.id)
                                .map((e) => (
                                  <SelectItem key={e.id} value={e.id}>
                                    {e.nome}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end pt-2 border-t border-slate-100">
                    <Button
                      onClick={handleSave}
                      disabled={saving}
                      className="gap-2 bg-blue-600 hover:bg-blue-700"
                    >
                      {saving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Salvar Template
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card className="shadow-sm border-slate-200 bg-[#e5ddd5] overflow-hidden">
                  <CardHeader className="bg-[#075e54] text-white py-3 rounded-t-xl">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Smartphone className="w-5 h-5" />
                      Pré-visualização
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 h-[400px] overflow-y-auto flex flex-col items-start gap-2">
                    <div className="bg-white rounded-lg rounded-tl-none p-4 max-w-[90%] shadow-sm relative text-sm text-slate-800 whitespace-pre-wrap">
                      {getPreviewText(
                        activeData.tipo === 'texto_simples'
                          ? activeData.texto
                          : activeData.pergunta_texto,
                      ) || <span className="text-slate-400 italic">Digite algo...</span>}
                      <span className="text-[10px] text-slate-400 block text-right mt-1">
                        {format(new Date(), 'HH:mm')}
                      </span>
                    </div>
                    {activeData.tipo === 'chatbot_interativo' && (
                      <div className="flex flex-col gap-2 w-[90%] mt-1">
                        <div className="bg-white rounded-lg p-3 text-center shadow-sm text-blue-500 font-medium cursor-pointer hover:bg-slate-50 transition-colors">
                          {activeData.botao_sim_texto || 'Sim'}
                        </div>
                        <div className="bg-white rounded-lg p-3 text-center shadow-sm text-blue-500 font-medium cursor-pointer hover:bg-slate-50 transition-colors">
                          {activeData.botao_nao_texto || 'Não'}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="shadow-sm border-slate-200">
                  <CardHeader className="pb-3 border-b border-slate-100">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Play className="w-4 h-4 text-blue-600" />
                      Testar Envio
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div className="space-y-2">
                      <Label>Número do WhatsApp</Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Ex: 11999999999"
                          value={testPhone}
                          onChange={(e) => setTestPhone(e.target.value)}
                        />
                        <Button
                          variant="secondary"
                          onClick={handleTest}
                          disabled={testing || !testPhone}
                          className="min-w-[120px] flex items-center justify-center gap-2"
                        >
                          {testing ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Enviando...
                            </>
                          ) : (
                            'Enviar Teste'
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

type EtapaTemplate = {
  id: string
  nome: string
  cor: string
  template: { id: string; texto: string } | null
}

export default function TemplatesPage() {
  const [etapas, setEtapas] = useState<EtapaTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>('')
  const [templateTexts, setTemplateTexts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testing, setTesting] = useState(false)
  const [history, setHistory] = useState<any[]>([])
  const { toast } = useToast()

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getEtapasComTemplates()
      setEtapas(data)
      if (data.length > 0) {
        setActiveTab(data[0].id)
        const texts: Record<string, string> = {}
        data.forEach((e) => {
          if (e.template) texts[e.id] = e.template.texto
        })
        setTemplateTexts(texts)
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar templates')
    } finally {
      setLoading(false)
    }
  }

  const loadHistory = async () => {
    try {
      const data = await getMessageHistory()
      setHistory(data)
    } catch (err) {
      console.error('Erro ao carregar histórico', err)
    }
  }

  useEffect(() => {
    loadData()
    loadHistory()
  }, [])

  const handleSave = async () => {
    if (!activeTab) return
    if (!window.confirm('Deseja realmente salvar as alterações neste template?')) return
    const text = templateTexts[activeTab] || ''
    try {
      setSaving(true)
      await saveTemplate(activeTab, text)
      toast({ title: 'Sucesso', description: 'Template salvo com sucesso.' })
      await loadData()
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.message || 'Erro ao salvar template.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!activeTab) return
    const text = templateTexts[activeTab] || ''
    if (!text) {
      toast({ title: 'Aviso', description: 'O template está vazio.', variant: 'destructive' })
      return
    }
    const cleanPhone = testPhone.replace(/\D/g, '')
    if (cleanPhone.length < 10) {
      toast({
        title: 'Erro',
        description: 'Telefone inválido. Digite um número com DDD.',
        variant: 'destructive',
      })
      return
    }

    try {
      setTesting(true)
      const previewMsg = getPreviewText(text)
      await testTemplate(testPhone, previewMsg)
      toast({ title: 'Sucesso', description: 'Mensagem de teste enviada.' })
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.message || 'Erro ao enviar teste.',
        variant: 'destructive',
      })
    } finally {
      setTesting(false)
    }
  }

  const insertVar = (variable: string) => {
    if (!activeTab) return
    const current = templateTexts[activeTab] || ''
    setTemplateTexts({ ...templateTexts, [activeTab]: current + variable })
  }

  const getPreviewText = (text: string) => {
    if (!text) return ''
    return text
      .replace(/{{nome_candidato}}/g, 'João da Silva')
      .replace(/{{nome_vaga}}/g, 'Desenvolvedor Front-end')
      .replace(/{{data_entrevista}}/g, '15/10/2026 às 14:00')
      .replace(/{{link_formulario}}/g, 'https://exemplo.com/form')
      .replace(/{nome_candidato}/g, 'João da Silva')
      .replace(/{nome_vaga}/g, 'Desenvolvedor Front-end')
  }

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="flex gap-4">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <Skeleton className="h-[400px]" />
          <Skeleton className="h-[400px]" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
        <h2 className="text-xl font-bold text-slate-800">Ops, ocorreu um erro</h2>
        <p className="text-slate-600">{error}</p>
        <Button onClick={loadData}>Tentar Novamente</Button>
      </div>
    )
  }

  if (etapas.length === 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center space-y-4 py-20">
        <MessageSquare className="w-16 h-16 text-slate-300 mx-auto" />
        <h2 className="text-2xl font-bold text-slate-800">Nenhum template configurado</h2>
        <p className="text-slate-600 max-w-md mx-auto">
          Você precisa ter etapas cadastradas no seu Kanban para configurar os templates de
          mensagem.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 animate-fade-in-up">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-blue-600" />
            Templates de Mensagens
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Configure as mensagens automáticas do WhatsApp enviadas ao mover candidatos de etapa.
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
              <DialogTitle>Histórico de Mensagens Enviadas</DialogTitle>
            </DialogHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Candidato</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Etapa</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-slate-500 py-8">
                      Nenhuma mensagem no histórico.
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(h.criado_em), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                      </TableCell>
                      <TableCell className="font-medium">{h.candidatos?.nome || '-'}</TableCell>
                      <TableCell>{h.candidatos?.telefone || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-slate-50">
                          {h.etapas?.nome || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={h.status === 'enviada' ? 'default' : 'destructive'}
                          className={h.status === 'enviada' ? 'bg-green-500' : ''}
                        >
                          {h.status === 'enviada' ? 'Enviada' : 'Falha'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
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
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white bg-white border border-slate-200 text-slate-600 rounded-full px-4 py-2 transition-all shadow-sm hover:border-blue-300"
            >
              {etapa.nome}
              {etapa.template ? (
                <span
                  className="ml-2 w-2 h-2 rounded-full bg-green-400 inline-block"
                  title="Template configurado"
                ></span>
              ) : (
                <span
                  className="ml-2 w-2 h-2 rounded-full bg-slate-300 inline-block"
                  title="Sem template"
                ></span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {etapas.map((etapa) => (
          <TabsContent key={etapa.id} value={etapa.id} className="mt-0 outline-none">
            <div className="grid lg:grid-cols-2 gap-6">
              <Card className="shadow-sm border-slate-200">
                <CardHeader className="bg-slate-50 border-b border-slate-100 rounded-t-xl pb-4">
                  <CardTitle className="text-lg">Editor de Template</CardTitle>
                  <CardDescription>
                    Escreva a mensagem para a etapa <strong>{etapa.nome}</strong>.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  <div className="space-y-3">
                    <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Variáveis Disponíveis
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        '{{nome_candidato}}',
                        '{{nome_vaga}}',
                        '{{data_entrevista}}',
                        '{{link_formulario}}',
                      ].map((v) => (
                        <Badge
                          key={v}
                          variant="secondary"
                          className="cursor-pointer hover:bg-blue-100 hover:text-blue-700 transition-colors bg-slate-100"
                          onClick={() => insertVar(v)}
                        >
                          {v}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Texto da Mensagem</Label>
                    <Textarea
                      className="min-h-[250px] resize-y font-mono text-sm leading-relaxed"
                      placeholder="Olá {{nome_candidato}}, temos uma novidade sobre a vaga de {{nome_vaga}}..."
                      value={templateTexts[etapa.id] || ''}
                      onChange={(e) =>
                        setTemplateTexts({ ...templateTexts, [etapa.id]: e.target.value })
                      }
                    />
                  </div>

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
                  <CardContent className="p-6 h-[300px] overflow-y-auto">
                    <div className="bg-white rounded-lg rounded-tl-none p-4 max-w-[90%] shadow-sm relative text-sm text-slate-800 whitespace-pre-wrap">
                      {getPreviewText(templateTexts[etapa.id]) || (
                        <span className="text-slate-400 italic">
                          Digite algo para visualizar...
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 absolute bottom-1 right-2">
                        {format(new Date(), 'HH:mm', { locale: ptBR })}
                      </span>
                    </div>
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
                          className="min-w-[100px]"
                        >
                          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar'}
                        </Button>
                      </div>
                      <p className="text-xs text-slate-500">
                        O envio de teste usará a UAZAPI e os dados de exemplo da pré-visualização.
                      </p>
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

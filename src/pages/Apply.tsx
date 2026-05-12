import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { UploadCloud, CheckCircle2, AlertCircle, FileText, Loader2, Briefcase } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

const formSchema = z.object({
  nome: z.string().min(2, 'Nome é obrigatório'),
  email: z.string().email('E-mail inválido'),
  telefone: z.string().min(10, 'Telefone inválido'),
})

type FormData = z.infer<typeof formSchema>

export default function ApplyPage() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [vagas, setVagas] = useState<any[]>([])
  const [vagaId, setVagaId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR'>('IDLE')
  const [progress, setProgress] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [extractedData, setExtractedData] = useState<any>(null)
  const [isDragging, setIsDragging] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
  })

  useEffect(() => {
    const fetchVagas = async () => {
      console.log('Iniciando carregamento de vagas...')
      const { data: vagas, error } = await supabase
        .from('vagas')
        .select('id, titulo')
        .order('titulo', { ascending: true })

      if (error) {
        console.log('Erro ao carregar vagas:', error)
      } else if (vagas && vagas.length > 0) {
        console.log('Vagas carregadas:', vagas)
        setVagas(vagas)
      } else {
        console.log('Nenhuma vaga encontrada no banco')
        setVagas([])
      }
    }

    if (userId) {
      fetchVagas()
    }
  }, [userId])

  const handleFile = (selectedFile: File) => {
    if (selectedFile.type !== 'application/pdf') {
      setErrorMsg('Apenas arquivos PDF são permitidos.')
      return
    }
    if (selectedFile.size > 5 * 1024 * 1024) {
      setErrorMsg('O arquivo deve ter no máximo 5MB.')
      return
    }
    setFile(selectedFile)
    setErrorMsg('')
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const onDragLeave = () => {
    setIsDragging(false)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const onSubmit = async (data: FormData) => {
    if (!vagaId) {
      setErrorMsg('Vaga é obrigatória')
      return
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(vagaId)) {
      setErrorMsg('Selecione uma vaga válida')
      return
    }

    if (!file) {
      setErrorMsg('Por favor, anexe o seu currículo.')
      return
    }
    if (!userId) {
      setErrorMsg('Link de candidatura inválido (User ID não encontrado).')
      return
    }

    console.log('--- Iniciando envio de candidatura ---')
    console.log('Vaga ID enviado:', vagaId)
    console.log('Nome:', data.nome)
    console.log('Email:', data.email)

    setStatus('LOADING')
    setProgress(10)

    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
      const filePath = `${userId}/${fileName}`

      setProgress(30)

      const { error: uploadError } = await supabase.storage
        .from('curriculos')
        .upload(filePath, file, { cacheControl: '3600', upsert: false })

      if (uploadError) throw new Error('Falha ao enviar o arquivo para o servidor.')

      setProgress(50)

      const progressInterval = setInterval(() => {
        setProgress((p) => (p < 90 ? p + 5 : p))
      }, 800)

      const { data: funcData, error: funcError } = await supabase.functions.invoke(
        'analyze-resume',
        {
          body: {
            filePath,
            nome: data.nome,
            email: data.email,
            telefone: data.telefone,
            vaga_id: vagaId,
            user_id: userId,
          },
        },
      )

      clearInterval(progressInterval)

      if (funcError) throw new Error('Erro ao analisar e processar o currículo.')
      if (funcData?.error) throw new Error(funcData.error)

      if (funcData?.candidato_id && vagaId) {
        try {
          console.log('cv_id:', funcData.candidato_id)
          console.log('vaga_id:', vagaId)

          const { error: analisarError } = await supabase.functions.invoke(
            'analisar-cv-criterios',
            {
              body: {
                cv_id: funcData.candidato_id,
                vaga_id: vagaId,
              },
            },
          )

          if (analisarError) {
            toast({
              title: 'Erro ao analisar currículo',
              variant: 'destructive',
            })
          } else {
            toast({
              title: 'Currículo analisado com sucesso',
            })
          }
        } catch (e) {
          toast({
            title: 'Erro ao analisar currículo',
            variant: 'destructive',
          })
        }
      }

      setProgress(100)
      setExtractedData(funcData.dados_extraidos)
      setStatus('SUCCESS')
    } catch (err: any) {
      setErrorMsg(err.message || 'Ocorreu um erro ao enviar sua candidatura.')
      setStatus('ERROR')
      setProgress(0)
    }
  }

  if (status === 'SUCCESS') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg border-green-100 shadow-lg animate-fade-in-up">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl text-green-800">
              Currículo recebido com sucesso!
            </CardTitle>
            <CardDescription className="text-base">
              Agradecemos o seu interesse. Seus dados foram processados e enviados à equipe de
              recrutamento.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 mt-4">
            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
              <h4 className="font-semibold text-xs text-slate-500 uppercase tracking-wider mb-3">
                Status da Candidatura
              </h4>
              <div className="flex items-center gap-3 text-slate-700">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                </span>
                <span className="font-medium">Em Análise (Etapa Inicial)</span>
              </div>
            </div>

            {extractedData && (
              <div className="space-y-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
                <h4 className="font-semibold text-xs text-slate-500 uppercase tracking-wider">
                  Perfil Extraído pela IA
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="block text-slate-500 text-xs mb-1">Nome</span>
                    <span
                      className="font-medium text-slate-900 truncate block"
                      title={extractedData.nome}
                    >
                      {extractedData.nome || 'Não identificado'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-slate-500 text-xs mb-1">E-mail</span>
                    <span
                      className="font-medium text-slate-900 truncate block"
                      title={extractedData.email}
                    >
                      {extractedData.email || 'Não identificado'}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="block text-slate-500 text-xs mb-2">
                      Principais Competências
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {extractedData.skills?.length > 0 ? (
                        extractedData.skills.slice(0, 6).map((skill: string, i: number) => (
                          <span
                            key={i}
                            className="px-2 py-1 bg-primary/10 text-black rounded-md text-xs font-medium"
                          >
                            {skill}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400 text-xs italic">
                          Nenhuma competência extraída do documento.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
            <Button className="w-full" variant="outline" onClick={() => window.location.reload()}>
              Enviar Nova Candidatura
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col p-4 md:p-8">
      <div className="max-w-3xl w-full mx-auto flex-1 flex flex-col">
        <div className="mb-8 text-center animate-fade-in-down">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-primary rounded-2xl mb-5 text-primary-foreground shadow-lg shadow-primary/20">
            <Briefcase className="w-7 h-7" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Trabalhe Conosco</h1>
          <p className="text-slate-500 mt-2 text-lg">
            Envie seu currículo e participe de nossos processos seletivos.
          </p>
        </div>

        <Card className="flex-1 border-slate-200 shadow-xl shadow-slate-200/50 bg-white/50 backdrop-blur-sm animate-fade-in-up">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Formulário de Inscrição</CardTitle>
            <CardDescription>
              Preencha seus dados básicos e anexe seu currículo em formato PDF.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {status === 'ERROR' && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-800 animate-fade-in">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">Ops, algo deu errado!</p>
                  <p className="text-sm text-red-700 mt-1">{errorMsg}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-800 hover:text-red-900 hover:bg-red-100"
                  onClick={() => setStatus('IDLE')}
                >
                  Tentar Novamente
                </Button>
              </div>
            )}

            {status === 'LOADING' ? (
              <div className="py-20 flex flex-col items-center justify-center space-y-8 animate-fade-in">
                <div className="relative">
                  <Loader2 className="w-16 h-16 text-primary animate-spin" />
                  <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse -z-10" />
                </div>
                <div className="text-center space-y-3 w-full max-w-sm">
                  <h3 className="text-xl font-semibold text-slate-900">Enviando currículo...</h3>
                  <p className="text-sm text-slate-500">
                    Nossa Inteligência Artificial está analisando seu perfil e extraindo os dados.
                  </p>
                  <Progress value={progress} className="h-2.5 w-full mt-6 bg-slate-100" />
                  <p className="text-xs text-slate-400 font-medium">{progress}% concluído</p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2.5">
                    <Label htmlFor="nome">Nome Completo</Label>
                    <Input
                      id="nome"
                      placeholder="Ex: Ana Souza"
                      className="h-11"
                      {...register('nome')}
                    />
                    {errors.nome && (
                      <p className="text-xs text-red-500 font-medium">{errors.nome.message}</p>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="Ex: ana@exemplo.com"
                      className="h-11"
                      {...register('email')}
                    />
                    {errors.email && (
                      <p className="text-xs text-red-500 font-medium">{errors.email.message}</p>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    <Label htmlFor="telefone">Telefone / WhatsApp</Label>
                    <Input
                      id="telefone"
                      placeholder="Ex: (11) 99999-9999"
                      className="h-11"
                      {...register('telefone')}
                    />
                    {errors.telefone && (
                      <p className="text-xs text-red-500 font-medium">{errors.telefone.message}</p>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    <Label htmlFor="vaga">Vaga de Interesse</Label>
                    <Select onValueChange={(value) => setVagaId(value)} value={vagaId}>
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Selecione uma vaga" />
                      </SelectTrigger>
                      <SelectContent>
                        {vagas.length === 0 ? (
                          <SelectItem value="none" disabled>
                            Nenhuma vaga aberta no momento
                          </SelectItem>
                        ) : (
                          vagas.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.titulo}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {(errorMsg === 'Vaga é obrigatória' ||
                      errorMsg === 'Selecione uma vaga válida') && (
                      <p className="text-xs text-red-500 font-medium">{errorMsg}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-base font-medium">Anexar Currículo</Label>
                  <p className="text-sm text-slate-500 mb-2">
                    Envie seu arquivo em formato PDF com tamanho máximo de 5MB.
                  </p>

                  <div
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200 group',
                      isDragging
                        ? 'border-primary bg-primary/5 scale-[1.01]'
                        : 'border-slate-300 hover:border-primary/50 hover:bg-slate-50',
                      file
                        ? 'bg-slate-50 border-solid border-slate-300 hover:border-slate-400'
                        : '',
                    )}
                  >
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      ref={fileInputRef}
                      onChange={(e) => {
                        if (e.target.files?.[0]) handleFile(e.target.files[0])
                      }}
                    />

                    {file ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                          <FileText className="w-7 h-7" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{file.name}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 mt-2"
                          onClick={(e) => {
                            e.stopPropagation()
                            setFile(null)
                          }}
                        >
                          Remover Arquivo
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 mb-2 group-hover:scale-110 transition-transform group-hover:bg-primary/10 group-hover:text-primary">
                          <UploadCloud className="w-7 h-7" />
                        </div>
                        <p className="text-sm font-medium text-slate-900">
                          Arraste seu currículo aqui ou clique para selecionar
                        </p>
                      </div>
                    )}
                  </div>
                  {errorMsg && !file && status === 'IDLE' && (
                    <p className="text-sm text-red-500 font-medium">{errorMsg}</p>
                  )}
                </div>

                <div className="pt-6 border-t border-slate-100 flex justify-end gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="w-full sm:w-auto px-8 h-12 text-base"
                    onClick={() => navigate('/dashboard')}
                  >
                    Voltar
                  </Button>
                  <Button type="submit" size="lg" className="w-full sm:w-auto px-8 h-12 text-base">
                    Enviar Inscrição
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

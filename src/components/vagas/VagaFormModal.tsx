import { useState, useEffect } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { VagaComEstatisticas, vagasService } from '@/services/vagas'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import { Loader2, Trash2 } from 'lucide-react'

const locationSchema = z.object({
  endereco: z.string().min(1, 'Endereço é obrigatório'),
  cidade: z.string().min(1, 'Cidade é obrigatória'),
  estado: z.string().min(1, 'Estado é obrigatório'),
})

const formSchema = z.object({
  titulo: z.string().min(1, 'Título é obrigatório'),
  descricao: z.string().optional(),
  texto_livre: z.string().optional(),
  localizacoes: z.array(locationSchema),
  raio_km: z.number().min(0),
})

type FormValues = z.infer<typeof formSchema>

interface VagaFormModalProps {
  isOpen: boolean
  onClose: () => void
  vaga: VagaComEstatisticas | null
  onSaved: () => void
}

export function VagaFormModal({ isOpen, onClose, vaga, onSaved }: VagaFormModalProps) {
  const { user } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      titulo: '',
      descricao: '',
      texto_livre: '',
      localizacoes: [],
      raio_km: 10,
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'localizacoes',
  })

  useEffect(() => {
    if (isOpen) {
      if (vaga) {
        const cq = (vaga.criterios_qualificacao as any) || {}
        form.reset({
          titulo: vaga.titulo,
          descricao: vaga.descricao || '',
          texto_livre: typeof cq === 'string' ? cq : cq.texto_livre || '',
          localizacoes: Array.isArray(cq.localizacoes) ? cq.localizacoes : [],
          raio_km: cq.raio_km !== undefined ? Number(cq.raio_km) : 10,
        })
      } else {
        form.reset({
          titulo: '',
          descricao: '',
          texto_livre: '',
          localizacoes: [],
          raio_km: 10,
        })
      }
    }
  }, [isOpen, vaga, form])

  const onSubmit = async (values: FormValues) => {
    if (!user) return
    try {
      setIsSubmitting(true)

      const payload = {
        titulo: values.titulo,
        descricao: values.descricao || null,
        criterios_qualificacao: {
          texto_livre: values.texto_livre || '',
          localizacoes: values.localizacoes,
          raio_km: values.raio_km,
        },
        user_id: user.id,
      }

      if (vaga) {
        await vagasService.updateVaga(vaga.id, payload)
        toast.success('Vaga atualizada com sucesso')
      } else {
        await vagasService.createVaga(payload)
        toast.success('Vaga criada com sucesso')
      }

      onSaved()
      onClose()
    } catch (error: any) {
      toast.error(vaga ? 'Erro ao atualizar vaga' : 'Erro ao criar vaga')
      console.error(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle>{vaga ? 'Editar Vaga' : 'Nova Vaga'}</DialogTitle>
        </DialogHeader>

        <div className="px-6 overflow-y-auto flex-1 min-h-0">
          <Form {...form}>
            <form id="vaga-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pb-6">
              <FormField
                control={form.control}
                name="titulo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título da Vaga *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Desenvolvedor Frontend Sênior" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="descricao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição (Opcional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Breve descrição da vaga e responsabilidades..."
                        className="resize-none h-20"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="texto_livre"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Critérios (Texto Livre)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Ex: 2+ anos de experiência, inglês fluente..."
                        className="resize-none h-20"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Estes critérios serão analisados pela inteligência artificial.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <FormLabel className="text-base font-semibold">Localizações Aceitas</FormLabel>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ endereco: '', cidade: '', estado: '' })}
                  >
                    Adicionar Localização
                  </Button>
                </div>
                {fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="space-y-4 p-4 border rounded-md relative bg-slate-50/50"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>

                    <FormField
                      control={form.control}
                      name={`localizacoes.${index}.endereco`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Endereço</FormLabel>
                          <FormControl>
                            <Input placeholder="Rua, número, bairro..." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name={`localizacoes.${index}.cidade`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cidade</FormLabel>
                            <FormControl>
                              <Input placeholder="São Paulo" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`localizacoes.${index}.estado`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Estado</FormLabel>
                            <FormControl>
                              <Input placeholder="SP" maxLength={2} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                ))}
                {fields.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">
                    Nenhuma localização adicionada. A IA não restringirá por localização.
                  </p>
                )}
              </div>

              <FormField
                control={form.control}
                name="raio_km"
                render={({ field }) => (
                  <FormItem className="pt-2">
                    <FormLabel>Raio de Aceitação (km)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        {...field}
                        value={field.value ?? 0}
                        onChange={(e) =>
                          field.onChange(e.target.value === '' ? 0 : Number(e.target.value))
                        }
                      />
                    </FormControl>
                    <FormDescription>
                      Distância máxima aceitável em torno das localizações acima.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </div>

        <DialogFooter className="p-6 pt-4 border-t">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="vaga-form" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {vaga ? 'Salvar Alterações' : 'Criar Vaga'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

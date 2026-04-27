import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
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
import { Loader2 } from 'lucide-react'

const formSchema = z.object({
  titulo: z.string().min(1, 'Título é obrigatório'),
  descricao: z.string().optional(),
  criterios_qualificacao: z
    .string()
    .refine((val) => {
      if (!val) return true
      try {
        JSON.parse(val)
        return true
      } catch {
        return false
      }
    }, 'JSON inválido. Certifique-se de usar aspas duplas e formato correto.')
    .optional(),
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
      criterios_qualificacao: '[\n  "Requisito 1",\n  "Requisito 2"\n]',
    },
  })

  useEffect(() => {
    if (isOpen) {
      if (vaga) {
        form.reset({
          titulo: vaga.titulo,
          descricao: vaga.descricao || '',
          criterios_qualificacao: vaga.criterios_qualificacao
            ? JSON.stringify(vaga.criterios_qualificacao, null, 2)
            : '',
        })
      } else {
        form.reset({
          titulo: '',
          descricao: '',
          criterios_qualificacao: '[\n  "Experiência com React",\n  "Inglês Avançado"\n]',
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
        criterios_qualificacao: values.criterios_qualificacao
          ? JSON.parse(values.criterios_qualificacao)
          : null,
        user_id: user.id,
      }

      if (vaga) {
        await vagasService.updateVaga(vaga.id, payload)
        toast.success('Vaga atualizada com sucesso!')
      } else {
        await vagasService.createVaga(payload)
        toast.success('Vaga criada com sucesso!')
      }

      onSaved()
      onClose()
    } catch (error: any) {
      toast.error('Erro ao salvar vaga: ' + error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{vaga ? 'Editar Vaga' : 'Nova Vaga'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
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
              name="criterios_qualificacao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Critérios de Qualificação (JSON)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='["Requisito 1", "Requisito 2"]'
                      className="font-mono text-sm h-32"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Insira um Array JSON válido com os critérios. A IA usará isso para analisar
                    currículos.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {vaga ? 'Salvar Alterações' : 'Criar Vaga'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

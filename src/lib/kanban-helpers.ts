import { supabase } from '@/lib/supabase/client'
import { toast } from '@/hooks/use-toast'

export function invokeWhatsAppForAdvancement(
  candidateId: string,
  originStageId: string,
  candidateName?: string,
) {
  supabase.functions
    .invoke('enviar-whatsapp', {
      body: { candidato_id: candidateId, etapa_id: originStageId },
    })
    .then(({ data, error }) => {
      if (error || data?.error) {
        toast({
          variant: 'destructive',
          title: 'Erro no WhatsApp',
          description:
            data?.detalhe ||
            data?.error ||
            error?.message ||
            'Ocorreu um erro ao processar o envio de WhatsApp.',
        })
      } else if (data?.warning) {
        toast({
          title: 'Aviso de envio',
          description: data.message || 'Movido, mas mensagem não enviada.',
          className: 'bg-yellow-500 text-white border-yellow-600',
        })
      } else if (data?.success) {
        toast({
          title: `Mensagem enviada para ${candidateName || 'o candidato'}`,
          className: 'bg-green-500 text-white border-green-600',
        })
      }
    })
    .catch(() => {
      toast({
        variant: 'destructive',
        title: 'Erro no WhatsApp',
        description: 'Ocorreu um erro no servidor ao tentar enviar a mensagem.',
      })
    })
}

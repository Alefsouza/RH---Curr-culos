import { supabase } from '@/lib/supabase/client'

export interface WhatsappCandidate {
  id: string
  nome: string
  telefone: string
  lastMessage: string
  lastMessageTime: string
  lastResponse: string | null
  conversations: {
    id: string
    texto: string
    direcao: 'enviada' | 'recebida'
    criado_em: string
  }[]
}

export async function getWhatsappDashboardData() {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Não autenticado')

  const userId = userData.user.id

  const { data: convData, error } = await supabase
    .from('conversas_whatsapp')
    .select(
      'id, candidato_id, texto, direcao, criado_em, candidatos!inner(nome, telefone, user_id)',
    )
    .eq('candidatos.user_id', userId)
    .order('criado_em', { ascending: true })

  if (error) throw error

  const { data: resData } = await supabase
    .from('respostas_whatsapp')
    .select('candidato_id, resposta')
    .order('criado_em', { ascending: true })

  const { count: sentCount } = await supabase
    .from('mensagens_whatsapp')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  const totalSim = resData?.filter((r) => r.resposta === 'sim').length || 0
  const totalNao = resData?.filter((r) => r.resposta === 'nao').length || 0

  const responsesByCandidato: Record<string, string> = {}
  resData?.forEach((r) => {
    responsesByCandidato[r.candidato_id] = r.resposta
  })

  const candMap = new Map<string, WhatsappCandidate>()

  convData?.forEach((c) => {
    if (!candMap.has(c.candidato_id)) {
      candMap.set(c.candidato_id, {
        id: c.candidato_id,
        nome: (c.candidatos as any)?.nome || 'Desconhecido',
        telefone: (c.candidatos as any)?.telefone || '',
        lastMessage: '',
        lastMessageTime: '',
        lastResponse: responsesByCandidato[c.candidato_id] || null,
        conversations: [],
      })
    }
    const cand = candMap.get(c.candidato_id)!
    cand.conversations.push({
      id: c.id,
      texto: c.texto,
      direcao: c.direcao as 'enviada' | 'recebida',
      criado_em: c.criado_em,
    })
    cand.lastMessage = c.texto
    cand.lastMessageTime = c.criado_em
  })

  const candidates = Array.from(candMap.values()).sort(
    (a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime(),
  )

  return {
    stats: { sent: sentCount || 0, yes: totalSim, no: totalNao },
    candidates,
  }
}

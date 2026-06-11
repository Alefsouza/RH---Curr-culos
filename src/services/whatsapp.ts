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
    respostaAssociada?: string | null
  }[]
}

export async function getWhatsappDashboardData() {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Não autenticado')

  const userId = userData.user.id

  const { data: convData, error } = await supabase
    .from('mensagens_whatsapp')
    .select(
      'id, candidato_id, conteudo, direcao, criado_em, uazapi_message_id, external_id, candidatos!inner(nome, telefone, user_id, ultima_resposta_whatsapp)',
    )
    .eq('candidatos.user_id', userId)
    .order('criado_em', { ascending: true })

  if (error) throw error

  const { data: resData, error: resError } = await supabase
    .from('respostas_whatsapp')
    .select('candidato_id, resposta, mensagem_id')
    .order('criado_em', { ascending: true })

  if (resError) {
    console.warn('Aviso: Falha ao buscar respostas (ignorado)', resError)
  }

  let sentCount = 0
  convData?.forEach((c) => {
    if (c.direcao === 'enviada') {
      sentCount++
    }
  })

  const totalSim = resData?.filter((r) => r.resposta === 'sim').length || 0
  const totalNao = resData?.filter((r) => r.resposta === 'nao').length || 0

  const responsesByCandidato: Record<string, string> = {}
  const responsesByMessage: Record<string, string> = {}

  resData?.forEach((r) => {
    if (r.resposta) {
      responsesByCandidato[r.candidato_id] = r.resposta
    }
    if (r.mensagem_id && r.resposta) {
      responsesByMessage[r.mensagem_id] = r.resposta
    }
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
        lastResponse:
          (c.candidatos as any)?.ultima_resposta_whatsapp ||
          responsesByCandidato[c.candidato_id] ||
          null,
        conversations: [],
      })
    }
    const cand = candMap.get(c.candidato_id)!

    let resposta = null
    if (c.uazapi_message_id && responsesByMessage[c.uazapi_message_id]) {
      resposta = responsesByMessage[c.uazapi_message_id]
    } else if (c.external_id && responsesByMessage[c.external_id]) {
      resposta = responsesByMessage[c.external_id]
    } else if (responsesByMessage[c.id]) {
      resposta = responsesByMessage[c.id]
    }

    cand.conversations.push({
      id: c.id,
      texto: c.conteudo || '',
      direcao: c.direcao as 'enviada' | 'recebida',
      criado_em: c.criado_em,
      respostaAssociada: resposta,
    })
    cand.lastMessage = c.conteudo || ''
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

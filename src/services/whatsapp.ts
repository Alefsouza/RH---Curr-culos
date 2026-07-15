import { supabase } from '@/lib/supabase/client'

export interface WhatsappCandidate {
  id: string
  nome: string
  telefone: string
  lastMessage: string
  lastMessageTime: string
  lastResponse: string | null
  isUnlinked?: boolean
  etapaId: string | null
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

  const msgQuery = supabase
    .from('mensagens_whatsapp')
    .select(
      'id, candidato_id, conteudo, direcao, criado_em, uazapi_message_id, external_id, numero_whatsapp, candidatos(nome, telefone, user_id, ultima_resposta_whatsapp, etapa_id)',
    )
    .not('conteudo', 'is', null)
    .neq('conteudo', '')
    .order('criado_em', { ascending: true })

  const resQuery = supabase
    .from('respostas_whatsapp')
    .select('candidato_id, resposta, mensagem_id, candidatos!inner(user_id)')
    .order('criado_em', { ascending: true })

  const candsQuery = supabase.from('candidatos').select('id, etapa_id')

  const [
    { data: convData, error: convError },
    { data: resData, error: resError },
    { data: candsData, error: candsError },
  ] = await Promise.all([msgQuery, resQuery, candsQuery])

  if (convError) throw convError

  if (resError) {
    console.warn('Aviso: Falha ao buscar respostas (ignorado)', resError)
  }

  const candidatoEtapaMap: Record<string, string | null> = {}
  if (candsData) {
    candsData.forEach((c) => {
      candidatoEtapaMap[c.id] = c.etapa_id
    })
  }

  const statsByStage: Record<string, { sent: number; yes: number; no: number }> = {}
  const allStats = { sent: 0, yes: 0, no: 0 }

  convData?.forEach((c) => {
    if (c.direcao === 'enviada') {
      allStats.sent++
      const etapaId = c.candidato_id ? candidatoEtapaMap[c.candidato_id] : null
      if (etapaId) {
        if (!statsByStage[etapaId]) statsByStage[etapaId] = { sent: 0, yes: 0, no: 0 }
        statsByStage[etapaId].sent++
      }
    }
  })

  const validMessageIds = new Set<string>()
  convData?.forEach((c) => {
    if (c.id) validMessageIds.add(c.id)
    if (c.uazapi_message_id) validMessageIds.add(c.uazapi_message_id)
    if (c.external_id) validMessageIds.add(c.external_id)
  })

  const responsesByCandidato: Record<string, string> = {}
  const responsesByMessage: Record<string, string> = {}

  const validResData = (resData || []).filter(
    (r) => r.mensagem_id && validMessageIds.has(r.mensagem_id),
  )

  validResData.forEach((r) => {
    if (r.resposta) {
      const respLower = r.resposta.toLowerCase()
      if (r.candidato_id) {
        responsesByCandidato[r.candidato_id] = respLower
      }
      if (r.mensagem_id) {
        responsesByMessage[r.mensagem_id] = respLower
      }

      if (respLower === 'sim') allStats.yes++
      if (respLower === 'nao') allStats.no++

      const etapaId = r.candidato_id ? candidatoEtapaMap[r.candidato_id] : null
      if (etapaId) {
        if (!statsByStage[etapaId]) statsByStage[etapaId] = { sent: 0, yes: 0, no: 0 }
        if (respLower === 'sim') statsByStage[etapaId].yes++
        if (respLower === 'nao') statsByStage[etapaId].no++
      }
    }
  })

  const candMap = new Map<string, WhatsappCandidate>()

  convData?.forEach((c) => {
    if (!c.conteudo || c.conteudo.trim() === '') return

    const candidateId = c.candidato_id || `unlinked_${c.numero_whatsapp}`

    if (!candMap.has(candidateId)) {
      candMap.set(candidateId, {
        id: candidateId,
        nome: (c.candidatos as any)?.nome || 'Contato Desconhecido',
        telefone: (c.candidatos as any)?.telefone || c.numero_whatsapp || '',
        lastMessage: '',
        lastMessageTime: '',
        lastResponse: (() => {
          const computed = c.candidato_id ? responsesByCandidato[c.candidato_id] : null
          if (computed === 'sim' || computed === 'nao') return computed
          return null
        })(),
        isUnlinked: !c.candidato_id,
        etapaId: (c.candidatos as any)?.etapa_id || null,
        conversations: [],
      })
    }
    const cand = candMap.get(candidateId)!

    let resposta = null
    if (c.uazapi_message_id && responsesByMessage[c.uazapi_message_id]) {
      resposta = responsesByMessage[c.uazapi_message_id]
    } else if (c.external_id && responsesByMessage[c.external_id]) {
      resposta = responsesByMessage[c.external_id]
    } else if (responsesByMessage[c.id]) {
      resposta = responsesByMessage[c.id]
    } else if (c.direcao === 'recebida' && c.conteudo) {
      const lower = c.conteudo.toLowerCase().trim()
      if (
        ['sim', 's', 'sim!', 'sin', 'quero', 'sim|sim'].includes(lower) ||
        lower.startsWith('sim|')
      ) {
        resposta = 'sim'
      } else if (
        [
          'nao',
          'não',
          'n',
          'não!',
          'nao tenho interesse',
          'não tenho interesse',
          'nao|nao',
          'não|nao',
        ].includes(lower) ||
        lower.startsWith('nao|')
      ) {
        resposta = 'nao'
      }
    }

    cand.conversations.push({
      id: c.id,
      texto: c.conteudo,
      direcao: c.direcao as 'enviada' | 'recebida',
      criado_em: c.criado_em,
      respostaAssociada: resposta,
    })
    cand.lastMessage = c.conteudo
    cand.lastMessageTime = c.criado_em
  })

  const candidates = Array.from(candMap.values()).sort(
    (a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime(),
  )

  return {
    stats: allStats,
    statsByStage,
    candidates,
  }
}

export async function sendDirectMessage(params: {
  candidato_id: string | null
  telefone: string
  mensagem: string
}) {
  const { data, error } = await supabase.functions.invoke('enviar-mensagem-direta', {
    body: params,
  })
  return { data, error }
}

export async function deleteConversation(params: {
  candidato_id: string | null
  numero_whatsapp?: string | null
}) {
  let msgQuery = supabase
    .from('mensagens_whatsapp')
    .select('id, candidato_id, uazapi_message_id, external_id')

  if (params.candidato_id) {
    msgQuery = msgQuery.eq('candidato_id', params.candidato_id)
  } else if (params.numero_whatsapp) {
    msgQuery = msgQuery.eq('numero_whatsapp', params.numero_whatsapp)
  } else {
    throw new Error('Nenhum identificador fornecido')
  }

  const { data: messages, error: msgError } = await msgQuery
  if (msgError) throw msgError

  const messageIds: string[] = []
  const candidatoIds = new Set<string>()
  messages?.forEach((m) => {
    if (m.id) messageIds.push(m.id)
    if (m.uazapi_message_id) messageIds.push(m.uazapi_message_id)
    if (m.external_id) messageIds.push(m.external_id)
    if (m.candidato_id) candidatoIds.add(m.candidato_id)
  })

  if (messageIds.length > 0) {
    const { error: resError } = await supabase
      .from('respostas_whatsapp')
      .delete()
      .in('mensagem_id', messageIds)
    if (resError) throw resError
  }

  for (const candId of candidatoIds) {
    const { error: resByCandError } = await supabase
      .from('respostas_whatsapp')
      .delete()
      .eq('candidato_id', candId)
    if (resByCandError) throw resByCandError

    const { error: convError } = await supabase
      .from('conversas_whatsapp')
      .delete()
      .eq('candidato_id', candId)
    if (convError) throw convError
  }

  let delQuery = supabase.from('mensagens_whatsapp').delete()
  if (params.candidato_id) {
    delQuery = delQuery.eq('candidato_id', params.candidato_id)
  } else if (params.numero_whatsapp) {
    delQuery = delQuery.eq('numero_whatsapp', params.numero_whatsapp)
  }
  const { error: delError } = await delQuery
  if (delError) throw delError

  for (const candId of candidatoIds) {
    const { error: candError } = await supabase
      .from('candidatos')
      .update({ ultima_resposta_whatsapp: null, ultima_resposta_em: null })
      .eq('id', candId)
    if (candError) throw candError
  }

  return { success: true }
}

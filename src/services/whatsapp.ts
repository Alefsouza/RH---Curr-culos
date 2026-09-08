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

  // 1. Busca todos os candidatos do sistema com sua etapa definida e status no Kanban
  // Ancoramos a busca de WhatsApp nos candidatos que estão no Kanban ou vinculados
  const { data: candsData, error: candsError } = await supabase
    .from('candidatos')
    .select('id, nome, telefone, etapa_id, ativo_kanban, vaga_id, ultima_resposta_whatsapp')
    .not('etapa_id', 'is', null)
    .neq('ativo_kanban', false)

  if (candsError) throw candsError

  const candidatoEtapaMap: Record<string, string | null> = {}
  const candidatoInfoMap: Record<
    string,
    { nome: string; telefone: string; etapaId: string | null; ultimaResposta: string | null }
  > = {}
  const candidateIds: string[] = []

  if (candsData) {
    candsData.forEach((c) => {
      candidatoEtapaMap[c.id] = c.etapa_id
      candidatoInfoMap[c.id] = {
        nome: c.nome,
        telefone: c.telefone || '',
        etapaId: c.etapa_id,
        ultimaResposta: c.ultima_resposta_whatsapp || null,
      }
      candidateIds.push(c.id)
    })
  }

  // Se não houver candidatos ativos no Kanban, retorna dashboard vazio
  if (candidateIds.length === 0) {
    return {
      stats: { sent: 0, yes: 0, no: 0 },
      statsByStage: {},
      candidates: [],
    }
  }

  // 2. Busca as mensagens ancoradas nos candidatos do Kanban em blocos de IDs
  // Garante que mensagens antigas e recentes apareçam sem serem truncadas pelo limite de 1000 linhas
  const BATCH_SIZE = 100
  const msgPromises: PromiseLike<any>[] = []
  for (let i = 0; i < candidateIds.length; i += BATCH_SIZE) {
    const batch = candidateIds.slice(i, i + BATCH_SIZE)
    msgPromises.push(
      Promise.resolve(
        supabase
          .from('mensagens_whatsapp')
          .select(
            'id, candidato_id, conteudo, direcao, criado_em, uazapi_message_id, external_id, numero_whatsapp, template_id, tipo, candidatos(nome, telefone, user_id, ultima_resposta_whatsapp, etapa_id)',
          )
          .in('candidato_id', batch)
          .not('conteudo', 'is', null)
          .neq('conteudo', '')
          .order('criado_em', { ascending: true }),
      ),
    )
  }

  const resQuery = Promise.resolve(
    supabase
      .from('respostas_whatsapp')
      .select('candidato_id, resposta, mensagem_id, candidatos!inner(user_id)')
      .in('candidato_id', candidateIds)
      .order('criado_em', { ascending: true }),
  )

  const [msgResults, { data: resData, error: resError }] = await Promise.all([
    Promise.all(msgPromises),
    resQuery,
  ])

  let convData: any[] = []
  for (const res of msgResults) {
    if (res.error) throw res.error
    if (res.data) {
      convData = convData.concat(res.data)
    }
  }

  // Ordena todas as mensagens cronologicamente (crescente para reconstruir o diálogo)
  convData.sort((a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime())

  if (resError) {
    console.warn('Aviso: Falha ao buscar respostas (ignorado)', resError)
  }

  const statsByStage: Record<string, { sent: number; yes: number; no: number }> = {}
  const allStats = { sent: 0, yes: 0, no: 0 }

  const isTemplateMsg = (c: any): boolean =>
    c.direcao === 'enviada' && (c.template_id != null || c.tipo === 'interativa')

  const detectResponse = (conteudo: string | null | undefined): 'sim' | 'nao' | null => {
    if (!conteudo) return null
    const lower = conteudo.toLowerCase().trim()
    if (
      ['sim', 's', 'sim!', 'sin', 'quero', 'sim|sim'].includes(lower) ||
      lower.startsWith('sim|')
    ) {
      return 'sim'
    }
    if (
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
      return 'nao'
    }
    return null
  }

  // Total de mensagens enviadas (mantido como estava: conta toda mensagem 'enviada')
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

  // Agrupa as mensagens por candidato, em ordem crescente de criado_em
  const msgsByCandidate: Record<string, any[]> = {}
  convData?.forEach((c) => {
    if (!c.candidato_id) return
    if (!msgsByCandidate[c.candidato_id]) msgsByCandidate[c.candidato_id] = []
    msgsByCandidate[c.candidato_id].push(c)
  })

  // Conta "Sim"/"Não" por template: somente respostas recebidas APÓS uma mensagem
  // de template, e no máximo uma por template (desempate por template_id).
  Object.values(msgsByCandidate).forEach((msgs) => {
    msgs.sort((a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime())
    let currentTemplateKey: string | null = null
    const credited = new Map<string, { sim: boolean; nao: boolean }>()

    msgs.forEach((m) => {
      if (isTemplateMsg(m)) {
        currentTemplateKey = m.template_id || m.id
      } else if (m.direcao === 'recebida') {
        const resp = detectResponse(m.conteudo)
        if (resp && currentTemplateKey) {
          const cred = credited.get(currentTemplateKey) || { sim: false, nao: false }
          if (resp === 'sim' && !cred.sim) {
            cred.sim = true
            allStats.yes++
            const etapaId = candidatoEtapaMap[m.candidato_id]
            if (etapaId) {
              if (!statsByStage[etapaId]) statsByStage[etapaId] = { sent: 0, yes: 0, no: 0 }
              statsByStage[etapaId].yes++
            }
          }
          if (resp === 'nao' && !cred.nao) {
            cred.nao = true
            allStats.no++
            const etapaId = candidatoEtapaMap[m.candidato_id]
            if (etapaId) {
              if (!statsByStage[etapaId]) statsByStage[etapaId] = { sent: 0, yes: 0, no: 0 }
              statsByStage[etapaId].no++
            }
          }
          credited.set(currentTemplateKey, cred)
        }
      }
    })
  })

  const responsesByMessage: Record<string, string> = {}
  const allResData = resData || []
  allResData.forEach((r) => {
    if (r.resposta && r.mensagem_id) {
      responsesByMessage[r.mensagem_id] = r.resposta.toLowerCase()
    }
  })

  // Somente conversas que possuem ao menos uma mensagem de template
  const templateCandidateIds = new Set<string>()
  convData?.forEach((c) => {
    if (c.candidato_id && isTemplateMsg(c)) templateCandidateIds.add(c.candidato_id)
  })

  const listRows =
    convData?.filter((c) => c.candidato_id && templateCandidateIds.has(c.candidato_id)) || []

  const candMap = new Map<string, WhatsappCandidate>()

  listRows.forEach((c) => {
    if (!c.conteudo || c.conteudo.trim() === '') return

    const candidateId = c.candidato_id
    const candInfo = candidatoInfoMap[candidateId]

    if (!candMap.has(candidateId)) {
      candMap.set(candidateId, {
        id: candidateId,
        nome: (c.candidatos as any)?.nome || candInfo?.nome || 'Contato Desconhecido',
        telefone: (c.candidatos as any)?.telefone || candInfo?.telefone || c.numero_whatsapp || '',
        lastMessage: '',
        lastMessageTime: '',
        lastResponse: (() => {
          const dbResponse =
            (c.candidatos as any)?.ultima_resposta_whatsapp || candInfo?.ultimaResposta
          if (dbResponse) {
            const lower = dbResponse.toLowerCase()
            if (lower === 'sim') return 'sim'
            if (lower === 'não' || lower === 'nao') return 'nao'
          }
          return null
        })(),
        isUnlinked: !c.candidato_id,
        etapaId: (c.candidatos as any)?.etapa_id || candInfo?.etapaId || null,
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

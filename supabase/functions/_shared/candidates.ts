import { normalizeCandidateName } from './validation.ts'

export interface FindDuplicateCandidateParams {
  userId?: string | null
  nome?: string | null
  email?: string | null
  telefones?: string[] | null
}

export interface CandidateDuplicateMatch {
  id: string
  nome: string
  email?: string | null
  telefone?: string | null
  vaga_id?: string | null
  etapa_id?: string | null
  duplicado_de?: string | null
  match_tipo: 'rpc' | 'nome' | 'email' | 'telefone'
}

/**
 * Busca de forma abrangente se já existe um candidato cadastrado:
 * 1) Tenta via RPC 'buscar_candidato_duplicado' no Postgres (com unaccent e normalização)
 * 2) Fallback para verificação em memória/query direta:
 *    - Mesmo e-mail
 *    - Mesmo nome normalizado (sem acentos, minúsculo, espaços unificados)
 *    - Mesmo telefone (dígitos limpos)
 */
export async function findExistingCandidate(
  supabase: any,
  params: FindDuplicateCandidateParams,
): Promise<CandidateDuplicateMatch | null> {
  const { userId, nome, email, telefones } = params

  const normNome = normalizeCandidateName(nome)
  const normEmail = (email || '').trim().toLowerCase()
  const cleanPhones: string[] = []

  if (Array.isArray(telefones)) {
    for (const t of telefones) {
      if (!t) continue
      let digits = String(t).replace(/\D/g, '')
      if (digits.startsWith('55') && digits.length > 11) {
        digits = digits.substring(2)
      }
      if (digits.length >= 8) {
        cleanPhones.push(digits)
      }
    }
  }

  // Se não temos nenhum critério de busca válido, retorna null
  if (!normNome && !normEmail && cleanPhones.length === 0) {
    return null
  }

  // 1. Tenta a função RPC buscar_candidato_duplicado
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('buscar_candidato_duplicado', {
      p_user_id: userId || null,
      p_nome: nome || null,
      p_email: normEmail || null,
      p_telefones: cleanPhones.length > 0 ? cleanPhones : null,
    })

    if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
      const match = rpcData[0]
      return {
        id: match.id,
        nome: match.nome,
        email: match.email,
        telefone: match.telefone,
        vaga_id: match.vaga_id,
        etapa_id: match.etapa_id,
        duplicado_de: match.duplicado_de,
        match_tipo: (match.match_tipo as any) || 'rpc',
      }
    }
  } catch (rpcErr) {
    console.warn('[findExistingCandidate] Falha ao invocar RPC buscar_candidato_duplicado:', rpcErr)
  }

  // 2. Fallback: Busca direta por e-mail se presente
  if (normEmail) {
    try {
      let q = supabase
        .from('candidatos')
        .select('id, nome, email, telefone, vaga_id, etapa_id, duplicado_de')
        .is('duplicado_de', null)
        .ilike('email', normEmail)
        .order('criado_em', { ascending: true })
        .limit(1)

      if (userId) q = q.eq('user_id', userId)
      const { data: emailData } = await q
      if (emailData && emailData.length > 0) {
        return { ...emailData[0], match_tipo: 'email' }
      }
    } catch (e) {
      console.warn('[findExistingCandidate] Falha ao buscar por email:', e)
    }
  }

  // 3. Fallback: Busca direta por telefone se presente
  if (cleanPhones.length > 0) {
    try {
      const orConditions: string[] = []
      for (const phone of cleanPhones) {
        orConditions.push(`telefone_normalizado.ilike.%${phone}%`)
        orConditions.push(`telefone.ilike.%${phone}%`)
      }
      let q = supabase
        .from('candidatos')
        .select('id, nome, email, telefone, vaga_id, etapa_id, duplicado_de')
        .is('duplicado_de', null)
        .or(orConditions.join(','))
        .order('criado_em', { ascending: true })
        .limit(1)

      if (userId) q = q.eq('user_id', userId)
      const { data: phoneData } = await q
      if (phoneData && phoneData.length > 0) {
        return { ...phoneData[0], match_tipo: 'telefone' }
      }
    } catch (e) {
      console.warn('[findExistingCandidate] Falha ao buscar por telefone:', e)
    }
  }

  // 4. Fallback: Busca direta por nome normalizado
  if (normNome && normNome.length >= 4) {
    try {
      let q = supabase
        .from('candidatos')
        .select('id, nome, email, telefone, vaga_id, etapa_id, duplicado_de')
        .is('duplicado_de', null)
        .order('criado_em', { ascending: true })

      if (userId) q = q.eq('user_id', userId)
      const { data: allCands } = await q.limit(500)
      if (allCands && allCands.length > 0) {
        const found = allCands.find((c: any) => normalizeCandidateName(c.nome) === normNome)
        if (found) {
          return { ...found, match_tipo: 'nome' }
        }
      }
    } catch (e) {
      console.warn('[findExistingCandidate] Falha ao buscar por nome:', e)
    }
  }

  return null
}

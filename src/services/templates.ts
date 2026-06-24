import { supabase } from '@/lib/supabase/client'

export async function getEtapasComTemplates() {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Não autenticado')

  const { data: userProfile } = await supabase
    .from('usuarios')
    .select('is_admin')
    .eq('id', userData.user.id)
    .single()

  const isAdmin = userProfile?.is_admin || false

  let etapasQuery = supabase.from('etapas').select('*').order('ordem')
  let templatesQuery = supabase.from('templates_mensagens').select('*')

  if (!isAdmin) {
    etapasQuery = etapasQuery.eq('user_id', userData.user.id)
    templatesQuery = templatesQuery.eq('user_id', userData.user.id)
  }

  const { data: etapas, error: etapasError } = await etapasQuery
  if (etapasError) throw etapasError

  const { data: templates, error: templatesError } = await templatesQuery
  if (templatesError) throw templatesError

  return (etapas || []).map((etapa) => ({
    ...etapa,
    template: templates?.find((t) => t.etapa_id === etapa.id) || null,
  }))
}

export async function saveTemplate(etapaId: string, templateData: any) {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Não autenticado')

  const { data: existing } = await supabase
    .from('templates_mensagens')
    .select('id')
    .eq('etapa_id', etapaId)
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (existing) {
    const { data, error } = await supabase
      .from('templates_mensagens')
      .update(templateData)
      .eq('id', existing.id)
      .select()
      .single()
    if (error) throw error
    return data
  } else {
    const { data, error } = await supabase
      .from('templates_mensagens')
      .insert({
        etapa_id: etapaId,
        ...templateData,
        user_id: userData.user.id,
      })
      .select()
      .single()
    if (error) throw error
    return data
  }
}

export async function getMessageHistory() {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Não autenticado')

  try {
    const { data: userProfile } = await supabase
      .from('usuarios')
      .select('is_admin')
      .eq('id', userData.user.id)
      .single()

    const isAdmin = userProfile?.is_admin || false

    let query = supabase
      .from('mensagens_whatsapp')
      .select(`
        id,
        status,
        criado_em,
        candidatos (nome, telefone),
        etapas (nome)
      `)
      .order('criado_em', { ascending: false })
      .limit(50)

    if (!isAdmin) {
      query = query.eq('user_id', userData.user.id)
    }

    const { data, error } = await query

    if (error) {
      console.warn('Erro ao buscar histórico de mensagens:', error)
      return []
    }
    return data || []
  } catch (err) {
    console.warn('Falha silenciosa ao processar histórico (JSON/Network):', err)
    return []
  }
}

export async function testTemplate(phone: string, templateData: any) {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Não autenticado')

  const { data, error } = await supabase.functions.invoke('test-whatsapp', {
    body: { phone, template: templateData },
  })

  if (error) {
    let errorMessage = error.message
    let erroDetalhe = ''
    if (error.context && typeof error.context.json === 'function') {
      try {
        const errData = await error.context.json()
        if (errData.message) errorMessage = errData.message
        if (errData.error && typeof errData.error === 'string') errorMessage = errData.error
        if (errData.detalhe) erroDetalhe = errData.detalhe
      } catch {
        /* intentionally ignored */
      }
    }
    throw new Error(
      JSON.stringify({
        message: errorMessage || 'Erro ao comunicar com a Edge Function.',
        detalhe: erroDetalhe,
      }),
    )
  }

  if (data && data.error) {
    throw new Error(
      JSON.stringify({ message: data.message || data.error, detalhe: data.detalhe || '' }),
    )
  }
  return data
}

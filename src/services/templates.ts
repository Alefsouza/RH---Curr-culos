import { supabase } from '@/lib/supabase/client'

export async function getEtapasComTemplates() {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Não autenticado')

  const { data: etapas, error: etapasError } = await supabase
    .from('etapas')
    .select('*')
    .eq('user_id', userData.user.id)
    .order('ordem')

  if (etapasError) throw etapasError

  const { data: templates, error: templatesError } = await supabase
    .from('templates_mensagem')
    .select('*')
    .eq('user_id', userData.user.id)

  if (templatesError) throw templatesError

  return (etapas || []).map((etapa) => ({
    ...etapa,
    template: templates?.find((t) => t.etapa_id === etapa.id) || null,
  }))
}

export async function saveTemplate(etapaId: string, texto: string) {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Não autenticado')

  const { data: existing } = await supabase
    .from('templates_mensagem')
    .select('id')
    .eq('etapa_id', etapaId)
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (existing) {
    const { data, error } = await supabase
      .from('templates_mensagem')
      .update({ texto })
      .eq('id', existing.id)
      .select()
      .single()
    if (error) throw error
    return data
  } else {
    const { data, error } = await supabase
      .from('templates_mensagem')
      .insert({
        etapa_id: etapaId,
        texto,
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

  const { data, error } = await supabase
    .from('mensagens_whatsapp')
    .select(`
      id,
      status,
      criado_em,
      candidatos (nome, telefone),
      etapas (nome)
    `)
    .eq('user_id', userData.user.id)
    .order('criado_em', { ascending: false })
    .limit(50)

  if (error) throw error
  return data
}

export async function testTemplate(phone: string, message: string) {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('Não autenticado')

  const { data, error } = await supabase.functions.invoke('test-whatsapp', {
    body: { phone, message },
  })

  if (error) throw error
  return data
}

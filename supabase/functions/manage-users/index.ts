import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-client-platform, apikey, content-type',
}

function parseJwtPayload(token: string): any | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const base64Url = parts[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const jsonStr = atob(padded)
    return JSON.parse(jsonStr)
  } catch (_e) {
    return null
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Acesso não autorizado.')
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) {
      throw new Error('Acesso não autorizado.')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Configurações de servidor ausentes.')
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    })

    // Valida o usuário autenticado via Supabase Auth
    let user: any = null

    // 1. Tenta validar via auth.getUser(token) com chave anon
    if (supabaseAnonKey) {
      const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false },
      })
      const { data: userData, error: authError } = await supabaseAuth.auth.getUser(token)
      if (!authError && userData?.user) {
        user = userData.user
      }
    }

    // 2. Fallback de validação com supabaseAdmin.auth.getUser(token)
    if (!user) {
      const { data: adminUserData, error: adminAuthError } = await supabaseAdmin.auth.getUser(token)
      if (!adminAuthError && adminUserData?.user) {
        user = adminUserData.user
      }
    }

    // 3. Fallback: decodificação do JWT caso as APIs do Auth estejam temporariamente indisponíveis
    if (!user) {
      const decoded = parseJwtPayload(token)
      if (decoded && decoded.sub && (decoded.exp ? decoded.exp * 1000 > Date.now() : true)) {
        const { data: authUserRecord } = await supabaseAdmin.auth.admin.getUserById(decoded.sub)
        if (authUserRecord?.user) {
          user = authUserRecord.user
        }
      }
    }

    if (!user) {
      throw new Error('Sessão inválida.')
    }

    // Checagem de privilégio de administrador:
    // Verifica primeiro nos metadados do usuário (user_metadata / app_metadata)
    // e na tabela public.usuarios (is_admin = true)
    const isAdminInMeta =
      user.user_metadata?.is_admin === true ||
      user.app_metadata?.is_admin === true ||
      user.is_super_admin === true

    let isAdminInTable = false
    const { data: profile } = await supabaseAdmin
      .from('usuarios')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.is_admin === true) {
      isAdminInTable = true
    }

    if (!isAdminInMeta && !isAdminInTable) {
      throw new Error('Acesso negado. Apenas administradores podem realizar esta ação.')
    }

    const bodyText = await req.text()
    const body = JSON.parse(bodyText)
    const { action, payload } = body

    if (action === 'list') {
      const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers()
      if (listError) throw listError

      const { data: profiles } = await supabaseAdmin
        .from('usuarios')
        .select('id, nome, is_admin, avatar_url')

      const users = usersData.users.map((u) => {
        const p = profiles?.find((pr) => pr.id === u.id)
        return {
          id: u.id,
          email: u.email,
          nome: p?.nome || u.user_metadata?.name || 'Sem nome',
          is_admin: p?.is_admin || false,
          avatar_url: p?.avatar_url || null,
          last_sign_in_at: u.last_sign_in_at,
          created_at: u.created_at,
        }
      })

      // Order by created_at DESC
      users.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      return new Response(JSON.stringify({ users }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'create') {
      const { email, password, nome, is_admin } = payload
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: nome, is_admin: is_admin || false },
      })
      if (createError) throw createError

      await supabaseAdmin
        .from('usuarios')
        .update({
          is_admin: is_admin || false,
          nome,
        })
        .eq('id', newUser.user.id)

      return new Response(JSON.stringify({ user: newUser.user }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'update') {
      const { id, email, nome, is_admin } = payload
      const { data: updatedUser, error: updateError } =
        await supabaseAdmin.auth.admin.updateUserById(id, {
          email,
          user_metadata: { name: nome, is_admin: is_admin || false },
        })
      if (updateError) throw updateError

      await supabaseAdmin
        .from('usuarios')
        .update({
          nome,
          email,
          is_admin: is_admin || false,
        })
        .eq('id', id)

      return new Response(JSON.stringify({ user: updatedUser.user }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'delete') {
      const { id } = payload
      if (id === user.id) throw new Error('Você não pode excluir sua própria conta.')

      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(id)
      if (deleteError) throw deleteError

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'reset-password') {
      const { id, password } = payload
      const { error: resetError } = await supabaseAdmin.auth.admin.updateUserById(id, { password })
      if (resetError) throw resetError

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    throw new Error('Ação inválida.')
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

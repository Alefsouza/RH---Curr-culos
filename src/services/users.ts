import { supabase } from '@/lib/supabase/client'

export type SystemUser = {
  id: string
  email: string
  nome: string
  is_admin: boolean
  last_sign_in_at: string | null
  created_at: string
  avatar_url: string | null
}

export const usersService = {
  list: async () => {
    const { data, error } = await supabase.functions.invoke('manage-users', {
      body: { action: 'list' },
    })
    if (error) throw error
    if (data.error) throw new Error(data.error)
    return data.users as SystemUser[]
  },
  create: async (payload: any) => {
    const { data, error } = await supabase.functions.invoke('manage-users', {
      body: { action: 'create', payload },
    })
    if (error) throw error
    if (data.error) throw new Error(data.error)
    return data
  },
  update: async (payload: any) => {
    const { data, error } = await supabase.functions.invoke('manage-users', {
      body: { action: 'update', payload },
    })
    if (error) throw error
    if (data.error) throw new Error(data.error)
    return data
  },
  delete: async (id: string) => {
    const { data, error } = await supabase.functions.invoke('manage-users', {
      body: { action: 'delete', payload: { id } },
    })
    if (error) throw error
    if (data.error) throw new Error(data.error)
    return data
  },
  resetPassword: async (id: string, password: string) => {
    const { data, error } = await supabase.functions.invoke('manage-users', {
      body: { action: 'reset-password', payload: { id, password } },
    })
    if (error) throw error
    if (data.error) throw new Error(data.error)
    return data
  },
}

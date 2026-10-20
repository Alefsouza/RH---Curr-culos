// AVOID UPDATING THIS FILE DIRECTLY. It is automatically generated.
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

// Import the supabase client like this:
// import { supabase } from "@/lib/supabase/client";

// Lock seguro para evitar conflitos de navigator.locks (Lock broken by another request with the 'steal' option)
// Mantém a persistência no localStorage intacta sem disputar navigator.locks
const safeLock = async <R>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> => {
  return await fn()
}

const globalForSupabase = globalThis as unknown as {
  __supabase_singleton__?: ReturnType<typeof createClient<Database>>
}

export const supabase =
  globalForSupabase.__supabase_singleton__ ??
  createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
      lock: safeLock,
    },
  })

if (typeof window !== 'undefined') {
  globalForSupabase.__supabase_singleton__ = supabase
}

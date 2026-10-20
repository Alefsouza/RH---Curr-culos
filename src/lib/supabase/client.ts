// AVOID UPDATING THIS FILE DIRECTLY. It is automatically generated.
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

// Import the supabase client like this:
// import { supabase } from "@/lib/supabase/client";

const globalForSupabase = globalThis as unknown as {
  __supabase_singleton__?: ReturnType<typeof createClient<Database>>
}

// Interceptor de fetch para auth e requisições Supabase com proteção contra timeout prolongado (504) e retries em cascata
const resilientFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const urlStr =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  const isAuthRefresh =
    urlStr.includes('/auth/v1/token') && urlStr.includes('grant_type=refresh_token')

  // Se for refresh_token, aplicamos um timeout razoável (12s) para não prender a thread por 35s com 504
  const timeoutMs = isAuthRefresh ? 12000 : 30000

  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  try {
    let finalInit = init
    if (init?.signal) {
      // Se já houver signal externo, encadeamos o abort
      const externalSignal = init.signal
      if (externalSignal.aborted) {
        controller.abort()
      } else {
        externalSignal.addEventListener('abort', () => controller.abort(), { once: true })
      }
    }

    finalInit = {
      ...init,
      signal: controller.signal,
    }

    const response = await fetch(input, finalInit)

    // Notifica se houver falha de 504 no refresh de token para que o useAuth possa agir
    if (
      isAuthRefresh &&
      (response.status === 504 || response.status === 502 || response.status === 503)
    ) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('supabase:auth-refresh-error', {
            detail: {
              status: response.status,
              statusText: response.statusText,
              url: urlStr,
            },
          }),
        )
      }
    }

    return response
  } catch (error: any) {
    if (isAuthRefresh) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('supabase:auth-refresh-error', {
            detail: {
              status: error?.name === 'AbortError' ? 504 : 0,
              statusText: error?.message || 'Timeout/Network error during token refresh',
              url: urlStr,
            },
          }),
        )
      }
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

export const supabase =
  globalForSupabase.__supabase_singleton__ ??
  createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
    global: {
      fetch: resilientFetch,
    },
  })

if (typeof window !== 'undefined') {
  globalForSupabase.__supabase_singleton__ = supabase
}

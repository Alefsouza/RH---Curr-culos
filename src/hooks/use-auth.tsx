import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/hooks/use-toast'

interface UserProfile {
  id: string
  email: string
  nome: string | null
  is_admin: boolean
  avatar_url: string | null
}

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: UserProfile | null
  refreshProfile: () => Promise<void>
  signUp: (email: string, password: string, name?: string) => Promise<{ error: any }>
  signIn: (email: string, password: string) => Promise<{ error: any }>
  signOut: () => Promise<{ error: any }>
  resetPassword: (email: string) => Promise<{ error: any }>
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshFailuresCountRef = useRef(0)
  const isRecoveringRef = useRef(false)

  useEffect(() => {
    // 1. Escuta mudanças normais de auth (SEM async/await no callback)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'SIGNED_OUT') {
        refreshFailuresCountRef.current = 0
        setSession(null)
        setUser(null)
        setProfile(null)
        setLoading(false)
        return
      }

      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        refreshFailuresCountRef.current = 0
      }

      setSession(newSession)
      setUser(newSession?.user ?? null)
      setLoading(false)
    })

    // 2. Carrega a sessão inicial
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)
      })
      .catch((err) => {
        console.warn('Erro ao obter sessão inicial:', err)
        setLoading(false)
      })

    // 3. Tratamento resiliente de falhas de refresh (504 timeout / falhas de rede)
    const handleAuthRefreshError = async (evt: Event) => {
      const customEvt = evt as CustomEvent<{ status: number; statusText: string; url: string }>
      console.warn('[useAuth] Falha detectada no refresh de token:', customEvt.detail)

      refreshFailuresCountRef.current += 1

      // Se falhar 2 vezes seguidas com timeout (504) ou erro de rede, executa recuperação graciosa
      if (refreshFailuresCountRef.current >= 2 && !isRecoveringRef.current) {
        isRecoveringRef.current = true
        console.warn('[useAuth] Falhas persistentes de refresh token. Iniciando sign-out gracioso.')

        toast({
          variant: 'destructive',
          title: 'Sessão expirada',
          description:
            'Sua sessão expirou ou o servidor de autenticação demorou a responder. Por favor, faça login novamente.',
          duration: 6000,
        })

        try {
          // Limpa tokens armazenados
          await supabase.auth.signOut({ scope: 'local' })
        } catch (signOutErr) {
          console.warn('[useAuth] Erro ao executar signOut local:', signOutErr)
          // Fallback de limpeza caso o signOut falhe
          if (typeof window !== 'undefined') {
            for (let i = window.localStorage.length - 1; i >= 0; i--) {
              const key = window.localStorage.key(i)
              if (key && (key.startsWith('sb-') || key.includes('supabase.auth.token'))) {
                window.localStorage.removeItem(key)
              }
            }
          }
        } finally {
          setSession(null)
          setUser(null)
          setProfile(null)
          setLoading(false)
          isRecoveringRef.current = false
          refreshFailuresCountRef.current = 0

          // Redireciona para /auth de forma limpa se estiver em rota autenticada
          if (
            typeof window !== 'undefined' &&
            window.location.pathname !== '/auth' &&
            !window.location.pathname.startsWith('/candidatar/')
          ) {
            window.location.href = '/auth'
          }
        }
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('supabase:auth-refresh-error', handleAuthRefreshError)
    }

    return () => {
      subscription.unsubscribe()
      if (typeof window !== 'undefined') {
        window.removeEventListener('supabase:auth-refresh-error', handleAuthRefreshError)
      }
    }
  }, [])

  const refreshProfile = async () => {
    if (user) {
      const { data } = await supabase.from('usuarios').select('*').eq('id', user.id).single()
      if (data) setProfile(data as UserProfile)
    }
  }

  useEffect(() => {
    if (user) {
      refreshProfile()
    } else {
      setProfile(null)
    }
  }, [user])

  const signUp = async (email: string, password: string, name?: string) => {
    if (!email.toLowerCase().endsWith('@viasudeste.com')) {
      return { error: { message: 'Acesso restrito a e-mails @viasudeste.com' } as any }
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: `${window.location.origin}/`,
      },
    })
    return { error }
  }

  const signIn = async (email: string, password: string) => {
    if (!email.toLowerCase().endsWith('@viasudeste.com')) {
      return { error: { message: 'Acesso restrito a e-mails @viasudeste.com' } as any }
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    return { error }
  }

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
    })
    return { error }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        refreshProfile,
        signUp,
        signIn,
        signOut,
        resetPassword,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

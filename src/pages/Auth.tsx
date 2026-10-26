import { useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { Navigate } from 'react-router-dom'
import { Eye, EyeOff, KeyRound, Loader2, Lock, Mail } from 'lucide-react'

const BG_IMAGE_URL =
  'https://wrnhfpncasqifaisvyaf.supabase.co/storage/v1/object/public/assets/6.jpeg'
const LOGO_URL =
  'https://wrnhfpncasqifaisvyaf.supabase.co/storage/v1/object/public/assets/logo_branco_transparente_nitido-80a6a-BIUCr1YD.png'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [showResetForm, setShowResetForm] = useState(false)
  const [resetEmail, setResetEmail] = useState('')

  const { signIn, resetPassword, user } = useAuth()
  const { toast } = useToast()

  if (user) {
    return <Navigate to="/dashboard" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)

    if (!email.trim() || !password) {
      setAuthError('Informe e-mail e senha para entrar.')
      return
    }

    setLoading(true)
    const { error } = await signIn(email.trim(), password)
    if (error) {
      setAuthError('Credenciais inválidas. Verifique seu e-mail e senha.')
      toast({ variant: 'destructive', title: 'Erro no login', description: error.message })
    } else {
      toast({ title: 'Bem-vindo de volta!' })
    }
    setLoading(false)
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetEmail) return
    setResetLoading(true)
    const { error } = await resetPassword(resetEmail)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message })
    } else {
      toast({
        title: 'E-mail enviado!',
        description: 'Verifique sua caixa de entrada para redefinir sua senha.',
      })
      setShowResetForm(false)
      setResetEmail('')
    }
    setResetLoading(false)
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-slate-950 p-4 selection:bg-emerald-500 selection:text-white">
      {/* Background Image com Cover */}
      <div
        className="absolute inset-0 scale-105 transform bg-cover bg-center bg-no-repeat transition-transform duration-1000"
        style={{ backgroundImage: `url("${BG_IMAGE_URL}")` }}
      />

      {/* Overlay escuro com leve gradiente para imersão cinematográfica */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/60 to-black/85 backdrop-blur-[2px]" />

      {/* Container Principal */}
      <div className="animate-fade-in-up relative z-10 flex w-full max-w-[440px] flex-col items-center">
        {/* Logo Via Sudeste em contêiner estilizado (glass box arredondado) */}
        <div className="mb-6 flex items-center justify-center rounded-2xl border border-white/15 bg-white/[0.08] px-8 py-4 shadow-2xl shadow-black/40 ring-1 ring-white/10 backdrop-blur-xl transition-all duration-300 hover:border-white/25">
          <img
            src={LOGO_URL}
            alt="Via Sudeste Transportes S/A"
            className="h-16 w-auto select-none object-contain drop-shadow-md"
            loading="eager"
          />
        </div>

        {/* Card de Login Glassmorphism */}
        <div className="w-full rounded-2xl border border-white/15 bg-slate-900/40 p-7 shadow-[0_20px_50px_rgba(0,0,0,0.6)] ring-1 ring-white/10 backdrop-blur-xl sm:p-8">
          {/* Cabeçalho do Card */}
          <div className="text-center">
            <h1 className="font-sans text-xl font-extrabold uppercase tracking-wider text-white drop-shadow-sm sm:text-2xl">
              GESTÃO DE CURRÍCULOS
            </h1>
            <p className="mt-1.5 text-xs font-normal text-slate-200/80 sm:text-sm">
              Insira suas credenciais para acessar sua conta
            </p>
          </div>

          {authError && (
            <div className="mt-4 animate-fade-in rounded-lg border border-red-500/30 bg-red-500/15 p-2.5 text-center text-xs font-medium text-red-200">
              {authError}
            </div>
          )}

          {!showResetForm ? (
            <form onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
              {/* Campo E-mail */}
              <div className="space-y-1.5">
                <label
                  htmlFor="email"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-200"
                >
                  E-mail <span className="text-red-400">*</span>
                </label>
                <div className="relative flex items-center">
                  <div className="pointer-events-none absolute left-3.5 flex items-center justify-center text-slate-500">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="ti@viasudeste.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`h-11 w-full rounded-lg border bg-white/95 pl-10 pr-4 text-sm font-medium text-slate-900 shadow-inner outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/70 ${
                      authError ? 'border-red-400 bg-red-50/90 text-red-900' : 'border-white/20'
                    }`}
                  />
                </div>
              </div>

              {/* Campo Senha */}
              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-200"
                >
                  Senha <span className="text-red-400">*</span>
                </label>
                <div className="relative flex items-center">
                  <div className="pointer-events-none absolute left-3.5 flex items-center justify-center text-slate-500">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`h-11 w-full rounded-lg border bg-white/95 pl-10 pr-11 text-sm font-medium text-slate-900 shadow-inner outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/70 ${
                      authError ? 'border-red-400 bg-red-50/90 text-red-900' : 'border-white/20'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    tabIndex={-1}
                    className="absolute right-3 flex items-center justify-center rounded p-1 text-slate-500 transition-colors hover:text-slate-800 focus:outline-none"
                    aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-emerald-700" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowResetForm(true)}
                  className="text-xs font-medium text-emerald-300 transition-colors hover:text-emerald-200"
                >
                  Esqueci a senha
                </button>
              </div>

              {/* Botão de Entrar (Verde Corporativo) */}
              <div className="pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="relative flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#22633d] text-sm font-semibold tracking-wide text-white shadow-lg shadow-black/30 ring-1 ring-white/10 transition-all duration-200 hover:bg-[#1b5232] hover:shadow-emerald-900/30 active:scale-[0.99] active:bg-[#164329] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                      <span>Entrando…</span>
                    </>
                  ) : (
                    <span>Entrar</span>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="mt-7 space-y-4">
              <div className="mb-2 flex items-center gap-2 text-slate-200">
                <KeyRound className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-semibold">Recuperar senha</span>
              </div>
              <p className="text-xs text-slate-300/70">
                Informe seu e-mail e enviaremos um link para redefinir sua senha.
              </p>

              <div className="space-y-1.5">
                <label
                  htmlFor="reset-email"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-200"
                >
                  E-mail <span className="text-red-400">*</span>
                </label>
                <div className="relative flex items-center">
                  <div className="pointer-events-none absolute left-3.5 flex items-center justify-center text-slate-500">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    id="reset-email"
                    type="email"
                    placeholder="ti@viasudeste.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                    className="h-11 w-full rounded-lg border border-white/20 bg-white/95 pl-10 pr-4 text-sm font-medium text-slate-900 shadow-inner outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/70"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={resetLoading}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#22633d] text-sm font-semibold text-white shadow-lg shadow-black/30 ring-1 ring-white/10 transition-all duration-200 hover:bg-[#1b5232] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {resetLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                    <span>Enviando…</span>
                  </>
                ) : (
                  <span>Enviar link de recuperação</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowResetForm(false)}
                className="w-full text-xs text-slate-300/70 transition-colors hover:text-white"
              >
                Voltar para o login
              </button>
            </form>
          )}

          {/* Rodapé do Card */}
          <div className="mt-6 text-center">
            <p className="text-xs text-slate-300/80">
              Acesso restrito ao sistema interno{' '}
              <span className="font-semibold text-white">Via Sudeste</span>
            </p>
          </div>
        </div>

        {/* Informações de copyright/versão discretas no fundo */}
        <p className="mt-6 text-center text-[11px] text-white/50">
          © {new Date().getFullYear()} Via Sudeste Transportes S/A. Todos os direitos reservados.
        </p>
      </div>
    </div>
  )
}

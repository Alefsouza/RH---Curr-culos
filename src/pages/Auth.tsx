import { useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { Navigate, Link } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, AlertCircle, KeyRound, BriefcaseBusiness } from 'lucide-react'

export default function AuthPage() {
  const [email, setEmail] = useState('financeiro@viasudeste.com')
  const [password, setPassword] = useState('Skip@Pass123')
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
    setLoading(true)
    setAuthError(null)

    const { error } = await signIn(email, password)
    if (error) {
      setAuthError(error.message)
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
    <div className="auth-page relative min-h-screen flex items-center justify-center p-4 overflow-hidden bg-slate-950">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/40" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.15),rgba(255,255,255,0))]" />

      <div className="relative z-10 w-full max-w-md animate-fade-in-up">
        {/* Logo Section */}
        <div className="flex justify-center mb-6">
          <div className="glass-logo-container rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl px-8 py-5 shadow-lg transition-all duration-300 hover:shadow-xl hover:bg-white/15 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[hsl(149_100%_33%)] text-white shadow-md">
              <BriefcaseBusiness className="h-6 w-6" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-2xl font-bold tracking-tight text-white drop-shadow-sm">
                Via Sudeste
              </span>
              <span className="text-xs uppercase tracking-widest text-emerald-400 font-semibold">
                Recursos Humanos
              </span>
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="glass-card rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl p-8 md:p-10">
          <div className="mb-6 text-center">
            <h2 className="text-xl font-bold text-white uppercase tracking-wide">
              Gestão de Currículos
            </h2>
            <p className="text-sm text-white/60 mt-2">
              Insira suas credenciais para acessar sua conta
            </p>
          </div>

          {authError && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-500/15 px-4 py-3 backdrop-blur-sm animate-fade-in">
              <AlertCircle className="h-4 w-4 text-red-300 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-100">{authError}</p>
            </div>
          )}

          {!showResetForm ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-white/80 text-sm font-medium">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(149_100%_45%)] pointer-events-none" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="glass-input h-11 pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-white/80 text-sm font-medium">
                  Senha
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(149_100%_45%)] pointer-events-none" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="glass-input h-11 pl-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors duration-200 focus:outline-none"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end"></div>

              <Button
                type="submit"
                className="w-full h-11 bg-[hsl(149_100%_33%)] hover:bg-[hsl(149_100%_28%)] text-white font-semibold shadow-lg transition-all duration-200 hover:shadow-xl mt-2"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Aguarde...
                  </span>
                ) : (
                  'Entrar'
                )}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="flex items-center gap-2 mb-2 text-white/80">
                <KeyRound className="h-4 w-4 text-[hsl(149_100%_45%)]" />
                <span className="text-sm font-medium">Recuperar Senha</span>
              </div>
              <p className="text-xs text-white/50 mb-2">
                Informe seu e-mail e enviaremos um link para redefinir sua senha.
              </p>
              <div className="space-y-2">
                <Label htmlFor="reset-email" className="text-white/80 text-sm font-medium">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(149_100%_45%)] pointer-events-none" />
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                    className="glass-input h-11 pl-10"
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full h-11 bg-[hsl(149_100%_33%)] hover:bg-[hsl(149_100%_28%)] text-white font-semibold shadow-lg transition-all duration-200 hover:shadow-xl"
                disabled={resetLoading}
              >
                {resetLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Enviando...
                  </span>
                ) : (
                  'Enviar link de recuperação'
                )}
              </Button>
              <button
                type="button"
                onClick={() => setShowResetForm(false)}
                className="w-full text-xs text-white/50 hover:text-white/80 transition-colors duration-200"
              >
                Voltar para o login
              </button>
            </form>
          )}

          {!showResetForm && <div className="mt-6 text-center"></div>}
        </div>

        <p className="mt-6 text-center text-xs text-white/40">
          © {new Date().getFullYear()} Via Sudeste — Todos os direitos reservados
        </p>
      </div>
    </div>
  )
}

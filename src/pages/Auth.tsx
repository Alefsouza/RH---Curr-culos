import { useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { Navigate } from 'react-router-dom'
import { Briefcase, Mail, Lock, Eye, EyeOff, AlertCircle, Bus } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function AuthPage() {
  const [email, setEmail] = useState('financeiro@viasudeste.com')
  const [password, setPassword] = useState('Skip@Pass')
  const [name, setName] = useState('')
  const [isLogin, setIsLogin] = useState(true)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const { signIn, signUp, user } = useAuth()
  const { toast } = useToast()

  if (user) {
    return <Navigate to="/" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setAuthError(null)

    if (isLogin) {
      const { error } = await signIn(email, password)
      if (error) {
        setAuthError(error.message)
        toast({ variant: 'destructive', title: 'Erro no login', description: error.message })
      } else {
        toast({ title: 'Bem-vindo de volta!' })
      }
    } else {
      const { error } = await signUp(email, password, name)
      if (error) {
        setAuthError(error.message)
        toast({ variant: 'destructive', title: 'Erro no cadastro', description: error.message })
      } else {
        toast({ title: 'Conta criada!', description: 'Sua conta foi criada com sucesso.' })
      }
    }
    setLoading(false)
  }

  return (
    <div className="auth-page relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105"
        style={{
          backgroundImage: `url('https://img.usecurling.com/p/1920/1080?q=bus%20fleet&color=green')`,
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/80" />

      <div className="relative z-10 w-full max-w-md animate-fade-in-up">
        <div className="glass-card rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl">
          <div className="flex flex-col items-center pt-8 px-8 pb-2">
            <div className="flex flex-col items-center gap-3 mb-6">
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[hsl(149_100%_33%)] to-[hsl(149_100%_25%)] shadow-lg">
                <Bus className="h-8 w-8 text-white" />
              </div>
              <div className="text-center">
                <h1 className="text-2xl font-bold text-white tracking-tight">Via Sudeste</h1>
                <p className="text-xs text-white/70 font-medium tracking-wide uppercase">
                  Gestão de Currículos
                </p>
              </div>
            </div>
          </div>

          <div className="px-8 pb-8">
            <div className="mb-6 text-center">
              <h2 className="text-xl font-semibold text-white">
                {isLogin ? 'Entrar' : 'Criar Conta'}
              </h2>
              <p className="text-sm text-white/60 mt-1">
                {isLogin ? 'Acesse o Kanban de Candidatos' : 'Preencha os dados para começar'}
              </p>
            </div>

            {authError && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-500/15 px-4 py-3 backdrop-blur-sm animate-fade-in">
                <AlertCircle className="h-4 w-4 text-red-300 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-100">{authError}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-white/80 text-sm font-medium">
                    Nome completo
                  </Label>
                  <div className="relative">
                    <Input
                      id="name"
                      placeholder="Seu nome"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="glass-input h-11 pl-4"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-white/80 text-sm font-medium">
                  E-mail
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 pointer-events-none" />
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
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 pointer-events-none" />
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
                ) : isLogin ? (
                  'Entrar'
                ) : (
                  'Cadastrar'
                )}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <button
                type="button"
                className="text-sm text-white/60 hover:text-white transition-colors duration-200 font-medium"
                onClick={() => {
                  setIsLogin(!isLogin)
                  setAuthError(null)
                }}
              >
                {isLogin ? 'Não tem uma conta? Cadastre-se' : 'Já tem uma conta? Entre'}
              </button>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-white/40">
          © {new Date().getFullYear()} Via Sudeste — Todos os direitos reservados
        </p>
      </div>
    </div>
  )
}

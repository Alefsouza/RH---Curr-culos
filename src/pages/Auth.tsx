import { useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { Navigate } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, AlertCircle, Bus } from 'lucide-react'

export default function AuthPage() {
  const [email, setEmail] = useState('financeiro@viasudeste.com')
  const [password, setPassword] = useState('Skip@Pass123')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const { signIn, user } = useAuth()
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

  return (
    <div className="auth-page relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105"
        style={{
          backgroundImage: `url('https://wrnhfpncasqifaisvyaf.supabase.co/storage/v1/object/public/assets/6.jpeg')`,
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/80" />

      <div className="relative z-10 w-full max-w-4xl animate-fade-in-up">
        <div className="flex flex-col md:flex-row items-stretch gap-0">
          {/* Logo Section */}
          <div className="flex-1 flex flex-col items-center justify-center glass-card rounded-t-2xl md:rounded-l-2xl md:rounded-tr-none border border-white/20 bg-white/10 backdrop-blur-xl p-8 md:p-12">
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-[hsl(149_100%_33%)] to-[hsl(149_100%_25%)] shadow-lg">
                <Bus className="h-10 w-10 text-white" />
              </div>
              <div className="text-center">
                <h1 className="text-2xl font-bold text-white tracking-tight">Via Sudeste</h1>
                <p className="text-xs text-white/70 font-medium tracking-wide uppercase mt-1">
                  Gestão de Currículos
                </p>
              </div>
            </div>
          </div>

          {/* Form Section */}
          <div className="flex-1 glass-card rounded-b-2xl md:rounded-r-2xl md:rounded-bl-none border border-white/20 bg-white/10 backdrop-blur-xl p-8 md:p-12">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-white uppercase tracking-wide">
                Gestão de Currículos
              </h2>
              <p className="text-sm text-white/60 mt-2">
                Insira suas credencias para acessar sua conta
              </p>
            </div>

            {authError && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-500/15 px-4 py-3 backdrop-blur-sm animate-fade-in">
                <AlertCircle className="h-4 w-4 text-red-300 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-100">{authError}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-white/80 text-sm font-medium">
                  Email
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
                ) : (
                  'Entrar'
                )}
              </Button>
            </form>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-white/40">
          © {new Date().getFullYear()} Via Sudeste — Todos os direitos reservados
        </p>
      </div>
    </div>
  )
}

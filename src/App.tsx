import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import Index from './pages/Index'
import AuthPage from './pages/Auth'
import NotFound from './pages/NotFound'
import Layout from './components/Layout'
import ApplyPage from './pages/Apply'
import JobsPage from './pages/Jobs'
import VagaDetalhes from './pages/VagaDetalhes'
import DashboardPage from './pages/dashboard/DashboardPage'
import TemplatesPage from './pages/TemplatesPage'
import UsersPage from './pages/admin/UsersPage'
import CandidateDetails from './pages/CandidateDetails'
import CandidatesPage from './pages/CandidatesPage'
import ReviewPage from './pages/ReviewPage'
import ProfilePage from './pages/ProfilePage'
import WhatsappPage from './pages/WhatsappPage'
import SincronizacaoPage from './pages/SincronizacaoPage'
import ConfiguracoesPage from './pages/ConfiguracoesPage'
import { AuthProvider, useAuth } from '@/hooks/use-auth'
import { BulkReanalysisProvider } from '@/contexts/BulkReanalysisContext'
import { BulkReanalysisBar } from '@/components/candidates/BulkReanalysisBar'

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/auth" replace />
  return <>{children}</>
}

const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <BulkReanalysisProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BulkReanalysisBar />
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/candidatar/:userId" element={<ApplyPage />} />
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Index />} />
              <Route path="/vagas" element={<JobsPage />} />
              <Route path="/vaga/:id" element={<VagaDetalhes />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/templates" element={<TemplatesPage />} />
              <Route path="/candidatos" element={<CandidatesPage />} />
              <Route path="/usuarios" element={<UsersPage />} />
              <Route path="/revisao" element={<ReviewPage />} />
              <Route path="/candidato/:id" element={<CandidateDetails />} />
              <Route path="/whatsapp" element={<WhatsappPage />} />
              <Route path="/sincronizacao" element={<SincronizacaoPage />} />
              <Route path="/configuracoes" element={<ConfiguracoesPage />} />
              <Route path="/perfil" element={<ProfilePage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </TooltipProvider>
      </BulkReanalysisProvider>
    </BrowserRouter>
  </AuthProvider>
)

export default App

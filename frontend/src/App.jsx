import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Spinner } from './components/ui'
import { useAuth } from './context/AuthContext'
import CalendarPage from './pages/CalendarPage'
import Home from './pages/Home'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import ForgotPassword from './pages/auth/ForgotPassword'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import ResetPassword from './pages/auth/ResetPassword'
import MemoriesGallery from './pages/memories/MemoriesGallery'
import MemoryDetail from './pages/memories/MemoryDetail'
import NewMemory from './pages/memories/NewMemory'
import PeopleList from './pages/people/PeopleList'
import PersonChest from './pages/people/PersonChest'
import PersonForm from './pages/people/PersonForm'

function Private({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="center-screen"><Spinner /></div>
  // Si llega desde un enlace de invitación sin sesión, vuelve ahí tras entrar.
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}

function PublicOnly({ children }) {
  const { user, loading, isNew } = useAuth()
  const location = useLocation()
  if (loading) return <div className="center-screen"><Spinner /></div>
  if (!user) return children
  const from = location.state?.from || '/'
  // Recién registrado → primero su perfil; después sigue a donde iba (p. ej. un enlace de invitación).
  return isNew
    ? <Navigate to="/bienvenida" replace state={{ next: from }} />
    : <Navigate to={from} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/registro" element={<PublicOnly><Register /></PublicOnly>} />
      <Route path="/recuperar" element={<PublicOnly><ForgotPassword /></PublicOnly>} />
      <Route path="/restablecer/:token" element={<ResetPassword />} />

      <Route path="/" element={<Private><Home /></Private>} />
      <Route path="/calendario" element={<Private><CalendarPage /></Private>} />
      <Route path="/ajustes" element={<Private><Settings /></Private>} />
      <Route path="/perfil" element={<Private><Profile /></Private>} />
      <Route path="/bienvenida" element={<Private><Profile onboarding /></Private>} />

      <Route path="/personas" element={<Private><PeopleList /></Private>} />
      <Route path="/personas/nueva" element={<Private><PersonForm /></Private>} />
      <Route path="/personas/:id" element={<Private><PersonChest /></Private>} />
      <Route path="/personas/:id/editar" element={<Private><PersonForm /></Private>} />

      <Route path="/recuerdos" element={<Private><MemoriesGallery /></Private>} />
      <Route path="/recuerdos/nuevo" element={<Private><NewMemory /></Private>} />
      <Route path="/recuerdo/:id" element={<Private><MemoryDetail /></Private>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

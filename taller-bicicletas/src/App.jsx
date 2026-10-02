import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Clientes from './pages/Clientes.jsx'
import ClienteDetalle from './pages/ClienteDetalle.jsx'
import Bicicletas from './pages/Bicicletas.jsx'
import BicicletaDetalle from './pages/BicicletaDetalle.jsx'
import Articulos from './pages/Articulos.jsx'
import ArticulosObsoletos from './pages/ArticulosObsoletos.jsx'
import ArticulosConsumo from './pages/ArticulosConsumo.jsx'
import Ordenes from './pages/Ordenes.jsx'

// Páginas de carga diferida: solo se descargan cuando se navega a ellas.
const OrdenDetalle = lazy(() => import('./pages/OrdenDetalle.jsx'))
const Configuracion = lazy(() => import('./pages/Configuracion.jsx'))

function ProtectedLayout() {
  const { token, user, isLoading } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  if (isLoading || !user) return <div className="grid min-h-screen place-items-center text-slate-400">Cargando sesión…</div>
  return <Layout />
}

export default function App() {
  const { token } = useAuth()
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-slate-400">Cargando…</div>}>
      <Routes>
        <Route path="/login" element={token ? <Navigate to="/" replace /> : <Login />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/clientes/:id" element={<ClienteDetalle />} />
          <Route path="/bicicletas" element={<Bicicletas />} />
          <Route path="/bicicletas/:id" element={<BicicletaDetalle />} />
          <Route path="/articulos" element={<Articulos />} />
          <Route path="/articulos/obsoletos" element={<ArticulosObsoletos />} />
          <Route path="/articulos/consumo" element={<ArticulosConsumo />} />
          <Route path="/ordenes" element={<Ordenes />} />
          <Route path="/ordenes/nueva" element={<OrdenDetalle />} />
          <Route path="/ordenes/:id" element={<OrdenDetalle />} />
          <Route path="/configuracion" element={<Configuracion />} />
          <Route path="/configuracion/:pestana" element={<Configuracion />} />
          <Route path="/operaciones" element={<Navigate to="/configuracion/operaciones" replace />} />
          <Route path="/empresa" element={<Navigate to="/configuracion/empresa" replace />} />
          <Route path="/usuarios" element={<Navigate to="/configuracion/usuarios" replace />} />
          <Route path="/backups" element={<Navigate to="/configuracion/copias" replace />} />
        </Route>
        <Route path="*" element={<Navigate to={token ? '/' : '/login'} replace />} />
      </Routes>
    </Suspense>
  )
}


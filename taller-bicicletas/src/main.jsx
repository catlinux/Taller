import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from 'react-query'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { AjustesProvider } from './context/AjustesContext.jsx'
import { BloqueoProvider } from './context/BloqueoContext.jsx'
import '@fontsource-variable/inter'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

// Aplica el último tema guardado antes de montar React para evitar el parpadeo
// del color al recargar. Los ajustes del servidor lo confirmarán después.
function aplicarTemaGuardado() {
  try {
    const guardado = localStorage.getItem('taller_tema')
    if (!guardado) return
    const tema = JSON.parse(guardado)
    const raiz = document.documentElement
    if (tema.colorAcento) raiz.dataset.acento = tema.colorAcento
    if (tema.densidad) raiz.dataset.densidad = tema.densidad
    if (tema.radioEsquinas) raiz.dataset.radio = tema.radioEsquinas
  } catch {
    // localStorage no disponible o JSON inválido: se usan los ajustes por defecto.
  }
}

aplicarTemaGuardado()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AjustesProvider>
            <BloqueoProvider>
              <App />
            </BloqueoProvider>
          </AjustesProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)

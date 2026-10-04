import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from 'react-query'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { AjustesProvider } from './context/AjustesContext.jsx'
import { BloqueoProvider } from './context/BloqueoContext.jsx'
import { DeshacerProvider } from './context/DeshacerContext.jsx'
import { registerSW } from 'virtual:pwa-register'
import { aplicarModo, leerModo } from './lib/modoColor.js'
import '@fontsource-variable/inter'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

// Aplica el último tema guardado antes de montar React para evitar el parpadeo
// del color al recargar. Los ajustes del servidor lo confirmarán después.
function aplicarTemaGuardado() {
  aplicarModo(leerModo())
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

// Actualización automática: busca una versión nueva al abrir y cada 5 minutos, y
// recarga la página cuando el nuevo service worker toma el control. Así no hace
// falta vaciar la caché a mano (Ctrl+Shift+R) tras un despliegue.
if ('serviceWorker' in navigator) {
  const habiaControlador = Boolean(navigator.serviceWorker.controller)
  let recargando = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // La primera instalación también cambia de controlador: solo se recarga si ya había uno.
    if (!habiaControlador || recargando) return
    recargando = true
    window.location.reload()
  })
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registro) {
      if (registro) setInterval(() => registro.update().catch(() => {}), 5 * 60 * 1000)
    },
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AjustesProvider>
            <BloqueoProvider>
              <DeshacerProvider>
                <App />
              </DeshacerProvider>
            </BloqueoProvider>
          </AjustesProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)

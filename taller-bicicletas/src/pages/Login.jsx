import ModoBadge from '../components/ModoBadge.jsx'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function Login() {
  const { login, token } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (token) return <Navigate to="/" replace />

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'No se pudo iniciar sesión')
      login(payload)
      try {
        sessionStorage.setItem('taller_intro', '1')
      } catch {
        /* sessionStorage no disponible: se omite la animación */
      }
      navigate('/', { replace: true })
    } catch (requestError) {
      setError(requestError.message || 'No se pudo conectar con el servidor')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 text-slate-100">
      <section className="card w-full max-w-md p-8">
        <div className="mb-8 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white p-2 shadow-suave">
            <img src="/icons/logo.png" alt="Logo" className="h-full w-full object-contain" />
          </span>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-white">Taller de bicicletas</h1>
          <ModoBadge className="mt-3 inline-block" />
          <p className="mt-2 text-sm text-slate-400">Inicia sesión para gestionar el día a día.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="login-usuario" className="label">Usuario</label>
            <input id="login-usuario" autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} className="input mt-2" />
          </div>
          <div>
            <label htmlFor="login-password" className="label">Contraseña</label>
            <input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="input mt-2" />
          </div>
          {error && <p role="alert" className="rounded-lg border border-peligro/40 bg-peligro/10 px-4 py-3 text-sm text-peligro">{error}</p>}
          <button disabled={submitting} className="btn-primary w-full">{submitting ? 'Accediendo…' : 'Iniciar sesión'}</button>
        </form>
      </section>
    </main>
  )
}

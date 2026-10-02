import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useAuth } from '../context/AuthContext.jsx'
import { apiGet, apiPost } from '../lib/api.js'

// Formatea una fecha ISO como "dd/mm/aaaa hh:mm"
function formatearFechaHora(valor) {
  if (!valor) return '—'
  const fecha = new Date(valor)
  return Number.isNaN(fecha.getTime()) ? '—' : fecha.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Convierte un tamaño en bytes a una cadena legible en B, KB o MB
function formatearTamano(bytes) {
  const numero = Number(bytes)
  if (!Number.isFinite(numero) || numero < 0) return '—'
  if (numero < 1024) return `${numero} B`
  const kb = numero / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(2)} MB`
}

export default function Backups({ embebido = false }) {
  const { token } = useAuth()
  const queryClient = useQueryClient()
  const [errorAccion, setErrorAccion] = useState('')
  const [aviso, setAviso] = useState('')
  const [descargandoId, setDescargandoId] = useState(null)

  const { data: backups = [], isLoading, error } = useQuery(['backups'], () => apiGet('/api/backups', token), { enabled: Boolean(token) })

  const crear = useMutation(() => apiPost('/api/backups', token), {
    onSuccess: () => { setAviso('Se ha creado una nueva copia de seguridad.'); setErrorAccion(''); queryClient.invalidateQueries(['backups']) },
    onError: (e) => { setAviso(''); setErrorAccion(e.message) },
  })

  const restaurar = useMutation((id) => apiPost(`/api/backups/${id}/restaurar`, token), {
    onSuccess: () => { setAviso('La copia de seguridad se ha restaurado correctamente.'); setErrorAccion(''); queryClient.invalidateQueries() },
    onError: (e) => { setAviso(''); setErrorAccion(e.message) },
  })

  // La descarga necesita el token en la cabecera, por lo que no puede usarse
  // apiGet (que espera JSON). Se hace con fetch + blob + enlace temporal.
  async function descargar(backup) {
    setErrorAccion('')
    setAviso('')
    setDescargandoId(backup.id)
    try {
      const respuesta = await fetch(`/api/backups/${backup.id}/descargar`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!respuesta.ok) {
        if (respuesta.status === 401) window.dispatchEvent(new Event('auth:expired'))
        const datos = await respuesta.json().catch(() => ({}))
        throw new Error(datos.error || 'No se pudo descargar la copia de seguridad.')
      }
      const blob = await respuesta.blob()
      const url = URL.createObjectURL(blob)
      const enlace = document.createElement('a')
      enlace.href = url
      enlace.download = backup.filename
      document.body.appendChild(enlace)
      enlace.click()
      enlace.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErrorAccion(e.message)
    } finally {
      setDescargandoId(null)
    }
  }

  function confirmarRestaurar(backup) {
    const texto = `Se sustituirán TODOS los datos actuales por los de la copia del ${formatearFechaHora(backup.createdAt)}. Antes se hará una copia de seguridad automática del estado actual. ¿Continuar?`
    if (window.confirm(texto)) {
      setAviso('')
      setErrorAccion('')
      restaurar.mutate(backup.id)
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        {!embebido && (
          <div>
            <p className="text-sm text-azul-300">Administración</p>
            <h1 className="mt-1 text-3xl font-bold">Copias de seguridad</h1>
            <p className="mt-2 text-slate-400">Se hace una copia automática al arrancar el servidor y cada 24 horas; se conservan las 14 últimas.</p>
          </div>
        )}
        <button disabled={crear.isLoading} onClick={() => crear.mutate()} className="rounded-lg bg-azul-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-azul-600 disabled:opacity-50">{crear.isLoading ? 'Creando…' : 'Crear copia ahora'}</button>
      </div>

      {aviso && <p role="status" className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{aviso}</p>}
      {errorAccion && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{errorAccion}</p>}
      {error && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error.message}</p>}
      <div className="overflow-hidden rounded-xl border border-antracita-700 bg-antracita-800">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-antracita-700 bg-antracita-900/40 text-xs uppercase tracking-wide text-slate-500"><tr>
              <th className="px-5 py-4">Fecha y hora</th><th className="px-5 py-4">Tipo</th><th className="px-5 py-4">Tamaño</th><th className="px-5 py-4 text-right">Acciones</th>
            </tr></thead>
            <tbody className="divide-y divide-antracita-700/80">
              {isLoading ? <tr><td colSpan={4} className="px-5 py-12 text-center text-slate-400">Cargando copias de seguridad…</td></tr>
                : backups.length === 0 ? <tr><td colSpan={4} className="px-5 py-12 text-center text-slate-400">Todavía no hay copias de seguridad.</td></tr>
                  : backups.map((backup) => (
                    <tr key={backup.id} className="hover:bg-antracita-700/30">
                      <td className="px-5 py-4 font-medium text-white">{formatearFechaHora(backup.createdAt)}</td>
                      <td className="px-5 py-4">{backup.tipo === 'auto' ? <span className="rounded-full bg-azul-500/10 px-3 py-1 text-xs font-medium text-azul-300">Automática</span> : <span className="rounded-full bg-naranja-500/10 px-3 py-1 text-xs font-medium text-naranja-300">Manual</span>}</td>
                      <td className="px-5 py-4 text-slate-400">{formatearTamano(backup.size)}</td>
                      <td className="px-5 py-4"><div className="flex justify-end gap-2">
                        <button disabled={descargandoId === backup.id} onClick={() => descargar(backup)} className="rounded-md px-3 py-1.5 text-azul-300 hover:bg-azul-500/10 disabled:opacity-50">{descargandoId === backup.id ? 'Descargando…' : 'Descargar'}</button>
                        <button disabled={restaurar.isLoading} onClick={() => confirmarRestaurar(backup)} className="rounded-md px-3 py-1.5 text-naranja-300 hover:bg-naranja-500/10 disabled:opacity-50">Restaurar</button>
                      </div></td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

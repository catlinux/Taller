import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useAuth } from '../context/AuthContext.jsx'
import { apiGet, apiPost, apiPut } from '../lib/api.js'

const CAMPOS = [
  { name: 'nombre', label: 'Nombre', required: true },
  { name: 'cif', label: 'CIF', required: true },
  { name: 'direccion', label: 'Dirección', required: true },
  { name: 'codigoPostal', label: 'Código postal', required: true },
  { name: 'ciudad', label: 'Ciudad', required: true },
  { name: 'provincia', label: 'Provincia', required: true },
  { name: 'telefono', label: 'Teléfono', required: true },
  { name: 'email', label: 'Email', required: true },
  { name: 'web', label: 'Web', required: false },
  { name: 'logoUrl', label: 'URL del logotipo', required: false },
]

function valoresIniciales(empresa) {
  const inicial = {}
  for (const campo of CAMPOS) inicial[campo.name] = empresa?.[campo.name] ?? ''
  return inicial
}

export default function Empresa({ embebido = false }) {
  const { token, user } = useAuth()
  const esAdmin = user?.rol === 'admin'
  const queryClient = useQueryClient()
  const [valores, setValores] = useState(() => valoresIniciales(null))
  const [aviso, setAviso] = useState('')
  const [errorAccion, setErrorAccion] = useState('')

  const { data: empresas = [], isLoading, error } = useQuery(['empresa'], () => apiGet('/api/empresa', token), { enabled: Boolean(token) })
  const empresa = empresas[0] ?? null

  useEffect(() => { setValores(valoresIniciales(empresa)) }, [empresa])

  const refrescar = () => queryClient.invalidateQueries(['empresa'])
  const crear = useMutation((datos) => apiPost('/api/empresa', token, datos), {
    onSuccess: () => { refrescar(); setAviso('Datos de la empresa guardados correctamente.'); setErrorAccion('') },
    onError: (e) => { setErrorAccion(e.message); setAviso('') },
  })
  const actualizar = useMutation(({ id, datos }) => apiPut(`/api/empresa/${id}`, token, datos), {
    onSuccess: () => { refrescar(); setAviso('Datos de la empresa guardados correctamente.'); setErrorAccion('') },
    onError: (e) => { setErrorAccion(e.message); setAviso('') },
  })
  const guardando = crear.isLoading || actualizar.isLoading

  function handleChange(event) {
    const { name, value } = event.target
    setValores((prev) => ({ ...prev, [name]: value }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!esAdmin) return
    setAviso('')
    setErrorAccion('')
    const faltan = CAMPOS.filter((campo) => campo.required && !String(valores[campo.name] ?? '').trim())
    if (faltan.length > 0) {
      setErrorAccion(`Los siguientes campos son obligatorios: ${faltan.map((c) => c.label).join(', ')}.`)
      return
    }
    const datos = {}
    for (const campo of CAMPOS) {
      datos[campo.name] = campo.required ? String(valores[campo.name]).trim() : (String(valores[campo.name] ?? '').trim() || null)
    }
    if (empresa) actualizar.mutate({ id: empresa.id, datos })
    else crear.mutate(datos)
  }

  const inputClass = 'mt-1.5 w-full rounded-lg border border-antracita-600 bg-antracita-900 px-3 py-2.5 text-white outline-none focus:border-azul-400 disabled:cursor-not-allowed disabled:opacity-60'

  return (
    <div className="mx-auto max-w-4xl">
      {!embebido && (
        <div className="mb-8">
          <p className="text-sm text-azul-300">Configuración</p>
          <h1 className="mt-1 text-3xl font-bold">Empresa</h1>
          <p className="mt-2 text-slate-400">Datos fiscales y de contacto de la empresa. {esAdmin ? 'Puedes editarlos y guardarlos.' : 'Solo un administrador puede modificarlos.'}</p>
        </div>
      )}

      {aviso && <p role="status" className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{aviso}</p>}
      {errorAccion && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{errorAccion}</p>}
      {error && <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error.message}</p>}

      <div className="rounded-xl border border-antracita-700 bg-antracita-800 p-6">
        {isLoading ? <p className="py-8 text-center text-slate-400">Cargando datos de la empresa…</p> : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {CAMPOS.map((campo) => (
                <label key={campo.name} className="block text-sm text-slate-300">
                  {campo.label}{campo.required && <span> <span className="text-rose-400">*</span></span>}
                  <input
                    name={campo.name}
                    value={valores[campo.name]}
                    onChange={handleChange}
                    disabled={!esAdmin}
                    className={inputClass}
                  />
                </label>
              ))}
            </div>
            {esAdmin && (
              <div className="flex justify-end pt-2">
                <button disabled={guardando} className="rounded-lg bg-azul-500 px-4 py-2 text-sm font-semibold text-white hover:bg-azul-600 disabled:opacity-50">{guardando ? 'Guardando…' : 'Guardar datos'}</button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  )
}

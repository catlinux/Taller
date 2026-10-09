import { useState } from 'react'
import { Link } from 'react-router-dom'
import ClienteCampo from './ClienteCampo.jsx'
import { formatearMinutos, parsearDuracionLibre } from '../../lib/tiempos.js'

// Detalle de un trabajo programado: duración, nota, cliente, mecánico, fecha y
// hora. Devuelve solo los campos que cambian en onGuardar({ minutos?, nota?,
// clienteId?, mecanicoId?, fecha?, inicio? }). Si el trabajo está partido entre
// días, mover la fecha u hora lo mueve entero.
export default function ModalTrabajo({ bloque, fecha, mecanicos, token, onGuardar, onQuitar, onCerrar, guardando = false, error = '' }) {
  const trabajo = bloque.trabajo
  const clienteInicial = trabajo.cliente ? { id: trabajo.cliente.id, nombre: trabajo.cliente.nombreCorto, apellidos: '' } : null
  const [duracion, setDuracion] = useState(formatearMinutos(trabajo.minutos))
  const [nota, setNota] = useState(trabajo.nota ?? '')
  const [cliente, setCliente] = useState(clienteInicial)
  const [mecanicoId, setMecanicoId] = useState(trabajo.mecanicoId === null ? 'sin' : String(trabajo.mecanicoId))
  const [dia, setDia] = useState(fecha)
  const [hora, setHora] = useState(bloque.inicio)
  const [errorLocal, setErrorLocal] = useState('')

  function guardar(event) {
    event.preventDefault()
    const cambios = {}
    const minutos = parsearDuracionLibre(duracion)
    if (minutos === null) { setErrorLocal('La duración debe ser como 1:30, 45 o 1,5h.'); return }
    if (minutos !== trabajo.minutos) cambios.minutos = minutos
    if ((nota.trim() || null) !== (trabajo.nota ?? null)) cambios.nota = nota.trim() || null
    if ((cliente?.id ?? null) !== (trabajo.cliente?.id ?? null)) cambios.clienteId = cliente?.id ?? null
    const mecanicoNuevo = mecanicoId === 'sin' ? null : Number(mecanicoId)
    if (mecanicoNuevo !== trabajo.mecanicoId) cambios.mecanicoId = mecanicoNuevo
    if (dia !== fecha) cambios.fecha = dia
    if (hora !== bloque.inicio || dia !== fecha) cambios.inicio = hora
    if (!dia || !hora) { setErrorLocal('Indica la fecha y la hora.'); return }
    if (Object.keys(cambios).length === 0) { onCerrar(); return }
    setErrorLocal('')
    onGuardar(cambios)
  }

  const mensaje = errorLocal || error

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center overflow-y-auto bg-black/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onCerrar() }}>
      <form onSubmit={guardar} role="dialog" aria-modal="true" aria-labelledby="trabajo-titulo" className="my-auto w-full max-w-lg rounded-2xl border border-antracita-700 bg-antracita-800 p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="trabajo-titulo" className="text-lg font-semibold">{trabajo.descripcion}</h2>
            <p className="mt-1 text-sm text-slate-400">
              {trabajo.codigo ? `${trabajo.codigo} · ` : ''}{trabajo.categoria ? `${trabajo.categoria} · ` : ''}
              {bloque.inicio}–{bloque.fin}{bloque.partes > 1 ? ` · parte ${bloque.parte}/${bloque.partes}` : ''}
            </p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-lg px-3 py-2 text-slate-400 hover:bg-antracita-700 hover:text-white">×</button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Duración total</span>
            <input value={duracion} onChange={(event) => setDuracion(event.target.value)} aria-label="Duración" className="input mt-1" />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Mecánico</span>
            <select value={mecanicoId} onChange={(event) => setMecanicoId(event.target.value)} aria-label="Mecánico" className="input mt-1">
              <option value="sin">Sin asignar</option>
              {mecanicos.map((m) => <option key={m.id} value={String(m.id)}>{m.nombre}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Fecha</span>
            <input type="date" value={dia} onChange={(event) => setDia(event.target.value)} aria-label="Fecha" className="input mt-1" />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Hora de inicio</span>
            <input type="time" step={900} value={hora} onChange={(event) => setHora(event.target.value)} aria-label="Hora de inicio" className="input mt-1" />
          </label>
        </div>

        <div className="mt-4">
          <ClienteCampo token={token} cliente={cliente} onChange={setCliente} etiqueta="Cliente" />
        </div>

        <label className="mt-4 block text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Nota</span>
          <textarea value={nota} onChange={(event) => setNota(event.target.value)} rows={2} aria-label="Nota" className="input mt-1" />
        </label>

        {mensaje && <p role="alert" className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{mensaje}</p>}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-antracita-700 pt-4">
          <div className="flex gap-2">
            <button type="button" disabled={guardando} onClick={onQuitar} className="btn-ghost text-rose-300">Quitar</button>
            {trabajo.orden && <Link to={`/ordenes/${trabajo.orden.id}`} className="btn-ghost">Ver orden {trabajo.orden.numeroOrden}</Link>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onCerrar} className="btn-ghost">Cancelar</button>
            <button type="submit" disabled={guardando} className="btn-primary">Guardar</button>
          </div>
        </div>
      </form>
    </div>
  )
}

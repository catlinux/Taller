import { useState } from 'react'
import { formatearMinutos, parsearTiempo, horasAMinutos } from '../lib/tiempos.js'
import { IconFlechaArriba, IconFlechaAbajo } from './Icons.jsx'

// Número máximo de tiempos alternativos por operación (igual que el servidor).
const MAX_TIEMPOS = 5

// Convierte un valor del formulario en un número finito mayor o igual que 0.
// Devuelve null si el valor está vacío o no es un número válido.
function numeroNoNegativo(value) {
  const texto = String(value ?? '').trim()
  if (texto === '') return null
  const num = Number(texto)
  return Number.isFinite(num) && num >= 0 ? num : null
}

// Tiempos iniciales del editor: los guardados (minutos -> 'H:MM') o, para las
// operaciones antiguas sin tiempos, un único tiempo igual a tiempoDefecto.
function tiemposIniciales(operacion) {
  const guardados = Array.isArray(operacion?.tiempos) ? operacion.tiempos : []
  if (guardados.length > 0) return guardados.map((min) => formatearMinutos(min))
  if (operacion) return [formatearMinutos(horasAMinutos(operacion.tiempoDefecto))]
  return ['0:30']
}

export default function OperacionForm({ operacion, categorias = [], onSubmit, onCancel, isSaving }) {
  const [error, setError] = useState('')
  const [tiempos, setTiempos] = useState(() => tiemposIniciales(operacion))

  function cambiarTiempo(indice, valor) {
    setTiempos((actual) => actual.map((tiempo, i) => (i === indice ? valor : tiempo)))
  }

  function anadirTiempo() {
    setTiempos((actual) => (actual.length >= MAX_TIEMPOS ? actual : [...actual, '0:30']))
  }

  function quitarTiempo(indice) {
    setTiempos((actual) => (actual.length <= 1 ? actual : actual.filter((_, i) => i !== indice)))
  }

  // Mueve un tiempo a otra posición; el primero es el predeterminado.
  function moverTiempo(indice, destino) {
    if (destino < 0 || destino >= tiempos.length) return
    setTiempos((actual) => {
      const copia = [...actual]
      const [elemento] = copia.splice(indice, 1)
      copia.splice(destino, 0, elemento)
      return copia
    })
  }

  function handleSubmit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)

    const codigo = form.get('codigo').trim()
    const descripcion = form.get('descripcion').trim()
    const categoria = form.get('categoria').trim()
    const precioHoraDefecto = numeroNoNegativo(form.get('precioHoraDefecto'))
    const activo = form.get('activo') === 'on'

    if (!codigo) return setError('El código es obligatorio.')
    if (!descripcion) return setError('La descripción es obligatoria.')
    if (precioHoraDefecto === null) return setError('El precio/hora por defecto debe ser un número mayor o igual que 0.')

    // Cada tiempo debe ser «H:MM» válido (entre 0:01 y 24:00).
    const minutos = tiempos.map((texto) => parsearTiempo(texto))
    if (minutos.some((valor) => valor === null)) return setError('Cada tiempo debe tener el formato H:MM (por ejemplo 0:30), entre 0:01 y 24:00.')

    setError('')
    onSubmit({
      codigo,
      descripcion,
      categoria,
      tiempos: minutos,
      precioHoraDefecto,
      activo,
    })
  }

  const inputClass = 'mt-1.5 w-full rounded-lg border border-antracita-600 bg-antracita-900 px-3 py-2.5 text-white outline-none focus:border-azul-400'
  const botonMini = 'shrink-0 rounded-md border border-antracita-600 px-2 py-1.5 text-xs text-slate-300 hover:bg-antracita-700 disabled:opacity-40'
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-slate-300">Código <span className="text-rose-400">*</span><input name="codigo" required defaultValue={operacion?.codigo ?? ''} className={inputClass} /></label>
        <label className="block text-sm text-slate-300">Descripción <span className="text-rose-400">*</span><input name="descripcion" required defaultValue={operacion?.descripcion ?? ''} className={inputClass} /></label>
        <label className="block text-sm text-slate-300">
          Categoría
          <input name="categoria" list="operacion-categorias" placeholder="Sin categoría" defaultValue={operacion?.categoria ?? ''} className={inputClass} />
          <datalist id="operacion-categorias">
            {categorias.map((nombre) => <option key={nombre} value={nombre} />)}
          </datalist>
        </label>
        <label className="block text-sm text-slate-300">Precio/hora por defecto<input name="precioHoraDefecto" type="number" min="0" step="any" defaultValue={operacion?.precioHoraDefecto ?? 0} className={inputClass} /></label>
      </div>
      <fieldset className="rounded-lg border border-antracita-600 p-3">
        <legend className="px-1 text-sm text-slate-300">Tiempos (el primero es el predeterminado)</legend>
        <div className="space-y-2">
          {tiempos.map((texto, indice) => (
            <div key={indice} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-xs text-slate-500">Tiempo {indice + 1}</span>
              <input
                value={texto}
                onChange={(event) => cambiarTiempo(indice, event.target.value)}
                inputMode="numeric"
                placeholder="0:30"
                aria-label={`Tiempo ${indice + 1} (H:MM)`}
                className={`${inputClass} mt-0`}
              />
              {indice === 0
                ? <span className="shrink-0 rounded-md bg-azul-500/10 px-2 py-1 text-xs font-medium text-azul-300">Predeterminado</span>
                : <button type="button" onClick={() => moverTiempo(indice, 0)} title="Hacer predeterminado" className={botonMini}>Predeterminado</button>}
              <button type="button" onClick={() => moverTiempo(indice, indice - 1)} disabled={indice === 0} title="Subir" aria-label={`Subir el tiempo ${indice + 1}`} className={botonMini}>
                <IconFlechaArriba size={14} />
              </button>
              <button type="button" onClick={() => moverTiempo(indice, indice + 1)} disabled={indice === tiempos.length - 1} title="Bajar" aria-label={`Bajar el tiempo ${indice + 1}`} className={botonMini}>
                <IconFlechaAbajo size={14} />
              </button>
              <button type="button" onClick={() => quitarTiempo(indice)} disabled={tiempos.length <= 1} title="Quitar tiempo" aria-label={`Quitar el tiempo ${indice + 1}`} className={`${botonMini} text-rose-300`}>
                ×
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={anadirTiempo} disabled={tiempos.length >= MAX_TIEMPOS} className={`${botonMini} mt-3`}>Añadir tiempo</button>
      </fieldset>
      <label className="flex items-center gap-3 text-sm text-slate-300">
        <input name="activo" type="checkbox" defaultChecked={operacion ? operacion.activo : true} className="h-4 w-4 rounded border-antracita-600 bg-antracita-900 text-azul-500 focus:ring-azul-400" />
        Operación activa
      </label>
      <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={onCancel} className="rounded-lg border border-antracita-600 px-4 py-2 text-sm text-slate-300 hover:bg-antracita-700">Cancelar</button><button disabled={isSaving} className="rounded-lg bg-azul-500 px-4 py-2 text-sm font-semibold text-white mantener-blanco hover:bg-azul-600 disabled:opacity-50">{isSaving ? 'Guardando…' : operacion ? 'Guardar cambios' : 'Crear operación'}</button></div>
    </form>
  )
}

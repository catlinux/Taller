import { useState } from 'react'

// Convierte un valor del formulario en un número finito mayor o igual que 0.
// Devuelve null si el valor está vacío o no es un número válido.
function numeroNoNegativo(value) {
  const texto = String(value ?? '').trim()
  if (texto === '') return null
  const num = Number(texto)
  return Number.isFinite(num) && num >= 0 ? num : null
}

export default function OperacionForm({ operacion, onSubmit, onCancel, isSaving }) {
  const [error, setError] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)

    const codigo = form.get('codigo').trim()
    const descripcion = form.get('descripcion').trim()
    const tiempoDefecto = numeroNoNegativo(form.get('tiempoDefecto'))
    const precioHoraDefecto = numeroNoNegativo(form.get('precioHoraDefecto'))
    const activo = form.get('activo') === 'on'

    if (!codigo) return setError('El código es obligatorio.')
    if (!descripcion) return setError('La descripción es obligatoria.')
    if (tiempoDefecto === null) return setError('El tiempo por defecto debe ser un número mayor o igual que 0.')
    if (precioHoraDefecto === null) return setError('El precio/hora por defecto debe ser un número mayor o igual que 0.')

    setError('')
    onSubmit({
      codigo,
      descripcion,
      tiempoDefecto,
      precioHoraDefecto,
      activo,
    })
  }

  const inputClass = 'mt-1.5 w-full rounded-lg border border-antracita-600 bg-antracita-900 px-3 py-2.5 text-white outline-none focus:border-azul-400'
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-slate-300">Código <span className="text-rose-400">*</span><input name="codigo" required defaultValue={operacion?.codigo ?? ''} className={inputClass} /></label>
        <label className="block text-sm text-slate-300">Descripción <span className="text-rose-400">*</span><input name="descripcion" required defaultValue={operacion?.descripcion ?? ''} className={inputClass} /></label>
        <label className="block text-sm text-slate-300">Tiempo por defecto (horas)<input name="tiempoDefecto" type="number" min="0" step="any" defaultValue={operacion?.tiempoDefecto ?? 0} className={inputClass} /></label>
        <label className="block text-sm text-slate-300">Precio/hora por defecto<input name="precioHoraDefecto" type="number" min="0" step="any" defaultValue={operacion?.precioHoraDefecto ?? 0} className={inputClass} /></label>
      </div>
      <label className="flex items-center gap-3 text-sm text-slate-300">
        <input name="activo" type="checkbox" defaultChecked={operacion ? operacion.activo : true} className="h-4 w-4 rounded border-antracita-600 bg-antracita-900 text-azul-500 focus:ring-azul-400" />
        Operación activa
      </label>
      <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={onCancel} className="rounded-lg border border-antracita-600 px-4 py-2 text-sm text-slate-300 hover:bg-antracita-700">Cancelar</button><button disabled={isSaving} className="rounded-lg bg-azul-500 px-4 py-2 text-sm font-semibold text-white mantener-blanco hover:bg-azul-600 disabled:opacity-50">{isSaving ? 'Guardando…' : operacion ? 'Guardar cambios' : 'Crear operación'}</button></div>
    </form>
  )
}

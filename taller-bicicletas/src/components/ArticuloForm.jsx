import { useState } from 'react'

const IVAS_PERMITIDOS = [0, 4, 10, 21]

// Convierte un valor del formulario en un número finito mayor o igual que 0.
// Devuelve null si el valor está vacío o no es un número válido.
function numeroNoNegativo(value) {
  const texto = String(value ?? '').trim()
  if (texto === '') return null
  const num = Number(texto)
  return Number.isFinite(num) && num >= 0 ? num : null
}

export default function ArticuloForm({ articulo, onSubmit, onCancel, isSaving }) {
  const [error, setError] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)

    const referencia = form.get('referencia').trim()
    const descripcion = form.get('descripcion').trim()
    const familia = form.get('familia').trim()
    const proveedor = form.get('proveedor').trim()
    const precioCompra = numeroNoNegativo(form.get('precioCompra'))
    const precioVenta = numeroNoNegativo(form.get('precioVenta'))
    const stock = numeroNoNegativo(form.get('stock'))
    const iva = Number(form.get('iva'))

    if (!referencia) return setError('La referencia es obligatoria.')
    if (!descripcion) return setError('La descripción es obligatoria.')
    if (precioCompra === null) return setError('El precio de compra debe ser un número mayor o igual que 0.')
    if (precioVenta === null) return setError('El precio de venta debe ser un número mayor o igual que 0.')
    if (stock === null) return setError('El stock debe ser un número mayor o igual que 0.')
    if (!IVAS_PERMITIDOS.includes(iva)) return setError(`El IVA debe ser uno de los valores permitidos: ${IVAS_PERMITIDOS.join(', ')}.`)

    setError('')
    onSubmit({
      referencia,
      descripcion,
      familia: familia || null,
      proveedor: proveedor || null,
      precioCompra,
      precioVenta,
      iva,
      stock,
    })
  }

  const inputClass = 'mt-1.5 w-full rounded-lg border border-antracita-600 bg-antracita-900 px-3 py-2.5 text-white outline-none focus:border-azul-400'
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-slate-300">Referencia <span className="text-rose-400">*</span><input name="referencia" required defaultValue={articulo?.referencia ?? ''} className={inputClass} /></label>
        <label className="block text-sm text-slate-300">Descripción <span className="text-rose-400">*</span><input name="descripcion" required defaultValue={articulo?.descripcion ?? ''} className={inputClass} /></label>
        <label className="block text-sm text-slate-300">Familia<input name="familia" defaultValue={articulo?.familia ?? ''} className={inputClass} /></label>
        <label className="block text-sm text-slate-300">Proveedor<input name="proveedor" defaultValue={articulo?.proveedor ?? ''} className={inputClass} /></label>
        <label className="block text-sm text-slate-300">Precio de compra<input name="precioCompra" type="number" min="0" step="any" defaultValue={articulo?.precioCompra ?? 0} className={inputClass} /></label>
        <label className="block text-sm text-slate-300">Precio de venta<input name="precioVenta" type="number" min="0" step="any" defaultValue={articulo?.precioVenta ?? 0} className={inputClass} /></label>
        <label className="block text-sm text-slate-300">IVA<select name="iva" defaultValue={articulo?.iva ?? 21} className={inputClass}>{IVAS_PERMITIDOS.map((valor) => <option key={valor} value={valor}>{valor} %</option>)}</select></label>
        <label className="block text-sm text-slate-300">Stock<input name="stock" type="number" min="0" step="any" defaultValue={articulo?.stock ?? 0} className={inputClass} /></label>
      </div>
      <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={onCancel} className="rounded-lg border border-antracita-600 px-4 py-2 text-sm text-slate-300 hover:bg-antracita-700">Cancelar</button><button disabled={isSaving} className="rounded-lg bg-azul-500 px-4 py-2 text-sm font-semibold text-white hover:bg-azul-600 disabled:opacity-50">{isSaving ? 'Guardando…' : articulo ? 'Guardar cambios' : 'Crear artículo'}</button></div>
    </form>
  )
}

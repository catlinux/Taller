const tipos = ['BiciInfantil', 'XC', 'Trail', 'Enduro', 'Descens', 'Passeig', 'Gravel', 'Carretera', 'Triatlo', 'EBikePasseig', 'EBikeXC', 'EBikeEnduro', 'EBikeGravel', 'EBikeCarretera']

export default function BicicletaForm({ bicicleta, clientes, clienteFijo, onSubmit, onCancel, isSaving }) {
  function handleSubmit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    onSubmit({
      marca: form.get('marca').trim(), modelo: form.get('modelo').trim(), tipo: form.get('tipo'),
      clienteId: Number(form.get('clienteId')), numeroSerie: form.get('numeroSerie').trim(),
      color: form.get('color').trim(), tamano: form.get('tamano').trim(),
      anio: form.get('anio') ? Number(form.get('anio')) : null,
    })
  }

  const inputClass = 'mt-1.5 w-full rounded-lg border border-antracita-600 bg-antracita-900 px-3 py-2.5 text-white outline-none focus:border-azul-400'
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-slate-300">Marca <span className="text-rose-400">*</span><input name="marca" required defaultValue={bicicleta?.marca ?? ''} className={inputClass} /></label>
        <label className="block text-sm text-slate-300">Modelo <span className="text-rose-400">*</span><input name="modelo" required defaultValue={bicicleta?.modelo ?? ''} className={inputClass} /></label>
        <label className="block text-sm text-slate-300">Tipo <span className="text-rose-400">*</span><select name="tipo" required defaultValue={bicicleta?.tipo ?? 'Carretera'} className={inputClass}>{tipos.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}</select></label>
        {clienteFijo
          ? <label className="block text-sm text-slate-300">Cliente<input type="hidden" name="clienteId" value={clienteFijo.id} /><input value={`${clienteFijo.numeroCliente ? `#${clienteFijo.numeroCliente} · ` : ''}${clienteFijo.nombre} ${clienteFijo.apellidos || ''}`} readOnly disabled className={`${inputClass} opacity-70`} /></label>
          : <label className="block text-sm text-slate-300">Cliente <span className="text-rose-400">*</span><select name="clienteId" required defaultValue={bicicleta?.clienteId ?? ''} className={inputClass}><option value="" disabled>Selecciona un cliente</option>{clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.numeroCliente ? `#${cliente.numeroCliente} · ` : ''}{cliente.nombre} {cliente.apellidos}</option>)}</select></label>}
        <label className="block text-sm text-slate-300">N.º de serie<input name="numeroSerie" defaultValue={bicicleta?.numeroSerie ?? ''} className={inputClass} /></label>
        <label className="block text-sm text-slate-300">Color<input name="color" defaultValue={bicicleta?.color ?? ''} className={inputClass} /></label>
        <label className="block text-sm text-slate-300">Talla<input name="tamano" defaultValue={bicicleta?.tamano ?? ''} className={inputClass} /></label>
        <label className="block text-sm text-slate-300">Año<input name="anio" type="number" min="1900" max="2100" defaultValue={bicicleta?.anio ?? ''} className={inputClass} /></label>
      </div>
      <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={onCancel} className="rounded-lg border border-antracita-600 px-4 py-2 text-sm text-slate-300 hover:bg-antracita-700">Cancelar</button><button disabled={isSaving} className="rounded-lg bg-azul-500 px-4 py-2 text-sm font-semibold text-white mantener-blanco hover:bg-azul-600 disabled:opacity-50">{isSaving ? 'Guardando…' : bicicleta ? 'Guardar cambios' : 'Crear bicicleta'}</button></div>
    </form>
  )
}

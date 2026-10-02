const campos = [
  ['nombre', 'Nombre', true],
  ['apellidos', 'Apellidos'],
  ['email', 'Email', true],
  ['telefono', 'Teléfono'],
  ['dni', 'DNI'],
  ['direccion', 'Dirección'],
  ['codigoPostal', 'Código postal'],
  ['poblacion', 'Población'],
  ['provincia', 'Provincia'],
]

export default function ClienteForm({ cliente, onSubmit, onCancel, isSaving }) {
  const handleSubmit = (event) => {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    onSubmit(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()])))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {campos.map(([name, label, required]) => (
          <label key={name} className="block text-sm text-slate-300">
            {label}{required && <span className="ml-1 text-rose-400">*</span>}
            <input
              name={name}
              type={name === 'email' ? 'email' : 'text'}
              required={required}
              defaultValue={cliente?.[name] ?? ''}
              className="mt-1.5 w-full rounded-lg border border-antracita-600 bg-antracita-900 px-3 py-2.5 text-white outline-none focus:border-azul-400"
            />
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-antracita-600 px-4 py-2 text-sm text-slate-300 hover:bg-antracita-700">Cancelar</button>
        <button disabled={isSaving} className="rounded-lg bg-azul-500 px-4 py-2 text-sm font-semibold text-white mantener-blanco hover:bg-azul-600 disabled:opacity-50">
          {isSaving ? 'Guardando…' : cliente ? 'Guardar cambios' : 'Crear cliente'}
        </button>
      </div>
    </form>
  )
}

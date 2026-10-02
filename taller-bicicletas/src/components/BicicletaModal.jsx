import BicicletaForm from './BicicletaForm.jsx'

export default function BicicletaModal({ bicicleta, clientes, clienteFijo, onSubmit, onClose, isSaving }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="bicicleta-modal-title" className="my-auto w-full max-w-2xl rounded-2xl border border-antracita-700 bg-antracita-800 p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between"><div><h2 id="bicicleta-modal-title" className="text-xl font-semibold">{bicicleta ? 'Editar bicicleta' : 'Nueva bicicleta'}</h2><p className="mt-1 text-sm text-slate-400">Los campos marcados con * son obligatorios.</p></div><button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg px-3 py-2 text-slate-400 hover:bg-antracita-700 hover:text-white">×</button></div>
        <BicicletaForm bicicleta={bicicleta} clientes={clientes} clienteFijo={clienteFijo} onSubmit={onSubmit} onCancel={onClose} isSaving={isSaving} />
      </section>
    </div>
  )
}

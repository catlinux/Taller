// Pregunta qué hacer con los trabajos que ya hay en los días que se van a cerrar
// (festivo o vacaciones): pasarlos al siguiente día abierto o dejarlos donde están.
export default function ModalCierreTrabajos({ trabajos, enviando = false, onMover, onMantener, onCancelar }) {
  return (
    <div className="fixed inset-0 z-[140] grid place-items-center overflow-y-auto bg-black/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancelar() }}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="cierre-titulo" className="my-auto w-full max-w-md rounded-2xl border border-antracita-700 bg-antracita-800 p-6 shadow-2xl">
        <h2 id="cierre-titulo" className="text-lg font-semibold">Hay trabajos en los días que se cierran</h2>
        <p className="mt-2 text-sm text-slate-300">
          {trabajos === 1 ? 'Hay 1 trabajo planificado' : `Hay ${trabajos} trabajos planificados`} en esos días. ¿Qué hacemos?
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button type="button" disabled={enviando} onClick={onMover} className="btn-primary justify-center">
            {trabajos === 1 ? 'Pasar el trabajo al siguiente día abierto' : `Pasar los ${trabajos} trabajos al siguiente día abierto`}
          </button>
          <button type="button" disabled={enviando} onClick={onMantener} className="btn-secondary justify-center">Dejarlos <span className="text-xs text-slate-400">(se quedan en rojo)</span></button>
          <button type="button" disabled={enviando} onClick={onCancelar} className="btn-ghost justify-center">Cancelar</button>
        </div>
      </section>
    </div>
  )
}

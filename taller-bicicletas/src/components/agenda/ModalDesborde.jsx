import { formatearMinutos } from '../../lib/tiempos.js'

// Pregunta qué hacer cuando un trabajo se pasa del límite del día: forzarlo (se
// queda, en rojo) o pasar lo que falta al día siguiente (el trabajo se parte).
export default function ModalDesborde({ excesoMin, enviando = false, onForzar, onSiguiente, onCancelar }) {
  return (
    <div className="fixed inset-0 z-[140] grid place-items-center overflow-y-auto bg-black/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancelar() }}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="desborde-titulo" className="my-auto w-full max-w-md rounded-2xl border border-antracita-700 bg-antracita-800 p-6 shadow-2xl">
        <h2 id="desborde-titulo" className="text-lg font-semibold">El día se pasa</h2>
        <p className="mt-2 text-sm text-slate-300">
          No caben {formatearMinutos(excesoMin)} h de este trabajo en el día. ¿Qué hacemos?
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button type="button" disabled={enviando} onClick={onForzar} className="btn-secondary justify-center">Forzar el día <span className="text-xs text-slate-400">(se queda, en rojo)</span></button>
          <button type="button" disabled={enviando} onClick={onSiguiente} className="btn-primary justify-center">Pasar lo que falta al día siguiente</button>
          <button type="button" disabled={enviando} onClick={onCancelar} className="btn-ghost justify-center">Cancelar</button>
        </div>
      </section>
    </div>
  )
}

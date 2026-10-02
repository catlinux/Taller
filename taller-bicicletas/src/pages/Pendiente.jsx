export default function Pendiente({ titulo }) {
  return (
    <section>
      <div className="mb-8">
        <p className="text-sm font-medium text-azul-400">SECCIÓN</p>
        <h1 className="mt-2 text-3xl font-bold">{titulo}</h1>
      </div>
      <div className="rounded-xl border border-antracita-700 bg-antracita-800 p-10 text-center">
        <p className="text-lg font-medium text-slate-300">Próximamente</p>
        <p className="mt-2 text-sm text-slate-500">Esta sección todavía está en desarrollo.</p>
      </div>
    </section>
  )
}

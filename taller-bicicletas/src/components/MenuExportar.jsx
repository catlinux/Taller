import { useEffect, useRef, useState } from 'react'

// Menú desplegable de exportación accesible: el botón lleva aria-haspopup y la
// lista role=menu con sus role=menuitem. Se cierra con Esc, al hacer clic fuera
// del componente y al elegir una opción.
//
// Props:
//   opciones: [{ clave, etiqueta, onSeleccionar }]
//   exportando: boolean (mientras se genera un fichero)
//   deshabilitado: boolean
//   etiqueta: texto del botón (por defecto 'Exportar')
export default function MenuExportar({
  opciones = [],
  exportando = false,
  deshabilitado = false,
  etiqueta = 'Exportar',
}) {
  const [abierto, setAbierto] = useState(false)
  const contenedor = useRef(null)

  // Cierra el menú al pulsar Esc.
  useEffect(() => {
    if (!abierto) return undefined
    function alTeclado(event) {
      if (event.key === 'Escape') setAbierto(false)
    }
    window.addEventListener('keydown', alTeclado)
    return () => window.removeEventListener('keydown', alTeclado)
  }, [abierto])

  // Cierra el menú al hacer clic fuera del componente.
  useEffect(() => {
    if (!abierto) return undefined
    function alClicFuera(event) {
      if (contenedor.current && !contenedor.current.contains(event.target)) setAbierto(false)
    }
    document.addEventListener('mousedown', alClicFuera)
    return () => document.removeEventListener('mousedown', alClicFuera)
  }, [abierto])

  function elegir(opcion) {
    setAbierto(false)
    opcion.onSeleccionar()
  }

  return (
    <div ref={contenedor} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((valor) => !valor)}
        disabled={deshabilitado || exportando}
        aria-haspopup="menu"
        aria-expanded={abierto}
        className="btn-secondary"
      >
        {exportando ? 'Exportando…' : etiqueta}
        <IconChevronAbajo />
      </button>
      {abierto && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-44 overflow-hidden rounded-xl border border-antracita-700 bg-antracita-800 p-1 shadow-suave"
        >
          {opciones.map((opcion) => (
            <button
              key={opcion.clave}
              type="button"
              role="menuitem"
              onClick={() => elegir(opcion)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-antracita-700"
            >
              {opcion.etiqueta}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Flecha hacia abajo del botón (chevron, estilo Lucide como Icons.jsx).
function IconChevronAbajo() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

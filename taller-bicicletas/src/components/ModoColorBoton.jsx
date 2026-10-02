import { IconLuna, IconSol } from './Icons.jsx'
import { useModoColor } from '../lib/modoColor.js'

// Botón sol/luna para alternar entre modo oscuro y claro. Muestra el icono del
// modo al que se cambiará y recuerda la elección en el navegador.
export default function ModoColorBoton({ className = '' }) {
  const [modo, alternar] = useModoColor()
  const vaAClaro = modo === 'oscuro'
  const etiqueta = vaAClaro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={etiqueta}
      title={etiqueta}
      className={`grid h-9 w-9 place-items-center rounded-lg border border-antracita-700 text-slate-300 transition hover:bg-antracita-800 hover:text-white ${className}`}
    >
      {vaAClaro ? <IconSol size={18} /> : <IconLuna size={18} />}
    </button>
  )
}

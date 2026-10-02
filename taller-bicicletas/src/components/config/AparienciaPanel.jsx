import { IconCheck, IconLuna, IconSol } from '../Icons.jsx'
import { reproducirIntro } from '../IntroBienvenida.jsx'
import {
  AvisoSoloAdmin,
  Interruptor,
  PieGuardar,
  TarjetaOpcion,
  usePanelAjustes,
  usePrevisualizacionTema,
} from './comunes.jsx'
import { useModoColor } from '../../lib/modoColor.js'

const CLAVES = ['colorAcento', 'densidad', 'radioEsquinas', 'introActivada']

// Colores de acento disponibles (deben coincidir con las paletas de index.css).
const ACENTOS = [
  { valor: 'azul', etiqueta: 'Azul', color: '#3D8BFF' },
  { valor: 'naranja', etiqueta: 'Naranja', color: '#FF7A2F' },
  { valor: 'verde', etiqueta: 'Verde', color: '#22C55E' },
  { valor: 'violeta', etiqueta: 'Violeta', color: '#8B5CF6' },
  { valor: 'rosa', etiqueta: 'Rosa', color: '#EC4899' },
]

// Densidades disponibles. `altos` son las alturas de las barras de la muestra.
const DENSIDADES = [
  { valor: 'comoda', etiqueta: 'Cómoda', altos: [14, 11, 11, 11] },
  { valor: 'compacta', etiqueta: 'Compacta', altos: [7, 6, 6, 6] },
]

// Radios de esquina disponibles (deben coincidir con index.css).
const ESQUINAS = [
  { valor: 'normal', etiqueta: 'Normales', radio: '10px' },
  { valor: 'redondeado', etiqueta: 'Redondeadas', radio: '18px' },
  { valor: 'recto', etiqueta: 'Rectas', radio: '3px' },
]

// Modos de color de la interfaz (se recuerdan en el navegador del usuario).
const MODOS = [
  { valor: 'oscuro', etiqueta: 'Oscuro', Icono: IconLuna },
  { valor: 'claro', etiqueta: 'Claro', Icono: IconSol },
]

export default function AparienciaPanel() {
  const { base, borrador, actualizar, descartar, guardar, hayCambios, estado, mensaje, esAdmin, guardando } =
    usePanelAjustes(CLAVES)

  // Aplica el tema en vivo mientras se previsualiza y lo restaura al salir.
  usePrevisualizacionTema(borrador, base)

  // Modo de color (oscuro/claro): se aplica y se guarda al instante.
  const [modo, , cambiarModo] = useModoColor()

  return (
    <div>
      <h2 className="text-lg font-semibold text-white">Apariencia</h2>
      <p className="mt-1 text-sm text-slate-400">Personaliza el aspecto de la aplicación. Los cambios se ven al momento.</p>

      <section className="mt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Modo de color</h3>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          {MODOS.map((opcionModo) => {
            const activa = modo === opcionModo.valor
            const Icono = opcionModo.Icono
            return (
              <TarjetaOpcion
                key={opcionModo.valor}
                activa={activa}
                onClick={() => cambiarModo(opcionModo.valor)}
                etiqueta={opcionModo.etiqueta}
              >
                <Icono size={26} className={activa ? 'text-white' : 'text-slate-300'} />
              </TarjetaOpcion>
            )
          })}
        </div>
      </section>

      {!esAdmin && <div className="mt-5"><AvisoSoloAdmin /></div>}

      <section className="mt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Color de acento</h3>
        <div className="mt-3 flex flex-wrap gap-3">
          {ACENTOS.map((acento) => {
            const activa = borrador.colorAcento === acento.valor
            return (
              <button
                key={acento.valor}
                type="button"
                onClick={() => actualizar('colorAcento', acento.valor)}
                disabled={!esAdmin}
                aria-pressed={activa}
                aria-label={acento.etiqueta}
                title={acento.etiqueta}
                className={`flex h-12 w-12 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-60 ${activa ? 'ring-2 ring-white ring-offset-2 ring-offset-antracita-800' : 'hover:scale-105'}`}
                style={{ backgroundColor: acento.color }}
              >
                {activa && <IconCheck size={20} className="text-white mantener-blanco" />}
              </button>
            )
          })}
        </div>
      </section>

      <section className="mt-8">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Densidad de la interfaz</h3>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          {DENSIDADES.map((densidad) => {
            const activa = borrador.densidad === densidad.valor
            return (
              <TarjetaOpcion
                key={densidad.valor}
                activa={activa}
                disabled={!esAdmin}
                onClick={() => actualizar('densidad', densidad.valor)}
                etiqueta={densidad.etiqueta}
              >
                <div className="flex w-full flex-col justify-center gap-1.5">
                  {densidad.altos.map((alto, i) => (
                    <span key={i} className="block rounded bg-azul-500/40" style={{ height: `${alto}px` }} />
                  ))}
                </div>
              </TarjetaOpcion>
            )
          })}
        </div>
      </section>

      <section className="mt-8">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Radio de las esquinas</h3>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          {ESQUINAS.map((esquina) => {
            const activa = borrador.radioEsquinas === esquina.valor
            return (
              <TarjetaOpcion
                key={esquina.valor}
                activa={activa}
                disabled={!esAdmin}
                onClick={() => actualizar('radioEsquinas', esquina.valor)}
                etiqueta={esquina.etiqueta}
              >
                <span
                  className="block h-11 w-14 border-2 border-azul-400/70 bg-azul-500/10"
                  style={{ borderRadius: esquina.radio }}
                />
              </TarjetaOpcion>
            )
          })}
        </div>
      </section>

      <section className="mt-8">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Animación de bienvenida</h3>
        <div className="mt-3 flex items-center justify-between gap-4">
          <label htmlFor="intro-activada" className="text-sm text-slate-300">
            Mostrar la animación de bienvenida al abrir la aplicación
          </label>
          <Interruptor
            id="intro-activada"
            etiqueta="Mostrar la animación de bienvenida"
            checked={Boolean(borrador.introActivada)}
            onChange={(valor) => actualizar('introActivada', valor)}
            disabled={!esAdmin}
          />
        </div>
        <button type="button" onClick={reproducirIntro} className="btn-secondary mt-3">
          Ver la animación ahora
        </button>
      </section>

      <PieGuardar
        hayCambios={hayCambios}
        guardando={guardando}
        estado={estado}
        mensaje={mensaje}
        onGuardar={guardar}
        onDescartar={descartar}
      />
    </div>
  )
}

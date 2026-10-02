import { AvisoSoloAdmin, Interruptor, PieGuardar, usePanelAjustes } from './comunes.jsx'

const CLAVES = ['sesionHoras', 'bloqueoInactividadMinutos', 'pinActivado', 'pinMinutosInactividad']

// Convierte el texto de un input numérico en número (o '' si está vacío).
const aNumero = (valor) => (valor === '' ? '' : Number(valor))

export default function SeguridadPanel() {
  const { borrador, actualizar, descartar, guardar, hayCambios, estado, mensaje, esAdmin, guardando } =
    usePanelAjustes(CLAVES)

  const horas = Number(borrador.sesionHoras) || 0
  const pinActivado = Boolean(borrador.pinActivado)
  const minutosPin = Number(borrador.pinMinutosInactividad) || 0
  const minutosCierre = Number(borrador.bloqueoInactividadMinutos) || 0

  // Avisos de coherencia entre los ajustes de inactividad (no bloquean el guardado).
  const avisos = []
  if (pinActivado && minutosPin <= 0) {
    avisos.push('El PIN está activado: indica tras cuántos minutos de inactividad debe pedirse (mínimo 1).')
  }
  if (pinActivado && minutosCierre > 0 && minutosCierre <= minutosPin) {
    avisos.push(
      'El cierre de sesión por inactividad es igual o anterior al bloqueo con PIN, así que la sesión se cerrará antes de que llegue a pedirse el PIN.',
    )
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-white">Sesión y seguridad</h2>
      <p className="mt-1 text-sm text-slate-400">
        Caducidad de la sesión, bloqueo por inactividad y acceso rápido con PIN.
      </p>

      {!esAdmin && <div className="mt-5"><AvisoSoloAdmin /></div>}

      <section className="mt-6 space-y-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sesión</h3>

        <label className="block max-w-xs">
          <span className="label">La sesión caduca a las</span>
          <div className="mt-1.5 flex items-center gap-3">
            <input
              type="number"
              min="1"
              max="24"
              step="1"
              inputMode="numeric"
              value={borrador.sesionHoras ?? ''}
              onChange={(event) => actualizar('sesionHoras', aNumero(event.target.value))}
              disabled={!esAdmin}
              className="input w-24"
            />
            <span className="text-sm text-slate-400">horas</span>
          </div>
        </label>

        <label className="block max-w-xs">
          <span className="label">Bloquear tras inactividad</span>
          <div className="mt-1.5 flex items-center gap-3">
            <input
              type="number"
              min="0"
              max="240"
              step="1"
              inputMode="numeric"
              value={borrador.bloqueoInactividadMinutos ?? ''}
              onChange={(event) => actualizar('bloqueoInactividadMinutos', aNumero(event.target.value))}
              disabled={!esAdmin}
              className="input w-24"
            />
            <span className="text-sm text-slate-400">minutos (0 = nunca)</span>
          </div>
        </label>

        <p className="rounded-lg border border-antracita-700 bg-antracita-900/60 px-4 py-3 text-sm text-slate-400">
          La sesión completa dura {horas} {horas === 1 ? 'hora' : 'horas'} y, al caducar, hay que volver a escribir usuario
          y contraseña.{' '}
          {minutosCierre > 0
            ? `Además, tras ${minutosCierre} ${minutosCierre === 1 ? 'minuto' : 'minutos'} sin actividad se cierra la sesión automáticamente.`
            : 'No se cierra la sesión por inactividad (0 = nunca).'}
        </p>
      </section>

      <section className="mt-8 space-y-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Acceso rápido con PIN</h3>

        <div className="flex items-center justify-between gap-4">
          <label htmlFor="pin-activado" className="text-sm text-slate-300">
            Pedir solo un PIN cuando la pantalla se bloquea por inactividad
          </label>
          <Interruptor
            id="pin-activado"
            etiqueta="Activar el acceso rápido con PIN"
            checked={pinActivado}
            onChange={(valor) => actualizar('pinActivado', valor)}
            disabled={!esAdmin}
          />
        </div>

        <label className="block max-w-xs">
          <span className="label">Pedir el PIN tras</span>
          <div className="mt-1.5 flex items-center gap-3">
            <input
              type="number"
              min="1"
              max="120"
              step="1"
              inputMode="numeric"
              value={borrador.pinMinutosInactividad ?? ''}
              onChange={(event) => actualizar('pinMinutosInactividad', aNumero(event.target.value))}
              disabled={!esAdmin || !pinActivado}
              className="input w-24"
            />
            <span className="text-sm text-slate-400">minutos de inactividad</span>
          </div>
        </label>
      </section>

      {avisos.length > 0 && (
        <div className="mt-6 space-y-2">
          {avisos.map((aviso) => (
            <p
              key={aviso}
              role="status"
              className="rounded-lg border border-naranja-500/30 bg-naranja-500/10 px-4 py-3 text-sm text-naranja-300"
            >
              {aviso}
            </p>
          ))}
        </div>
      )}

      <p className="mt-6 rounded-lg border border-antracita-700 bg-antracita-900/60 px-4 py-3 text-sm text-slate-400">
        El PIN de acceso rápido es personal: cada usuario debe crear el suyo desde el menú de su cuenta. Si un usuario no
        tiene PIN, la aplicación no se bloqueará para él.
      </p>

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

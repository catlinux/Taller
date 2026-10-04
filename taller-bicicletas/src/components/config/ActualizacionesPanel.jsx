import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { useAuth } from '../../context/AuthContext.jsx'
import { apiGet, apiPost } from '../../lib/api.js'
import { AvisoSoloAdmin, Interruptor, PieGuardar, usePanelAjustes } from './comunes.jsx'

// Ajustes que gestiona este panel (comprobación automática de actualizaciones).
const CLAVES = ['actualizacionesActivas', 'actualizacionesHoras']

// Convierte el texto de un input numérico en número (o '' si está vacío).
const aNumero = (valor) => (valor === '' ? '' : Number(valor))

// Formatea una fecha ISO como "dd/mm/aaaa hh:mm".
function formatearFechaHora(valor) {
  if (!valor) return '—'
  const fecha = new Date(valor)
  return Number.isNaN(fecha.getTime())
    ? '—'
    : fecha.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Clase del punto de estado según el estado de cada paso de la actualización.
const CLASE_PASO = {
  pendiente: 'border-antracita-600 text-slate-500',
  'en curso': 'border-azul-500 text-azul-300',
  ok: 'border-emerald-500 text-emerald-300',
  error: 'border-rose-500 text-rose-300',
}

export default function ActualizacionesPanel() {
  const { token } = useAuth()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')

  const { borrador, actualizar, descartar, guardar, hayCambios, estado, mensaje, esAdmin, guardando } =
    usePanelAjustes(CLAVES)

  const activas = Boolean(borrador.actualizacionesActivas)

  // Estado del servidor: versión instalada y disponibilidad de actualizaciones.
  // Mientras hay una actualización en curso, se refresca cada 1,5 s.
  const { data, error: errorEstado } = useQuery(
    ['actualizaciones', 'panel'],
    () => apiGet('/api/actualizaciones', token),
    {
      enabled: esAdmin && Boolean(token),
      retry: false,
      refetchInterval: (datos) => (datos?.aplicando ? 1500 : false),
      refetchOnWindowFocus: true,
    },
  )

  const comprobar = useMutation(() => apiPost('/api/actualizaciones/comprobar', token), {
    onSuccess: (nuevo) => { setError(''); queryClient.setQueryData(['actualizaciones', 'panel'], nuevo) },
    onError: (e) => setError(e.message),
  })

  const aplicar = useMutation(() => apiPost('/api/actualizaciones/aplicar', token, { confirmar: true }), {
    onSuccess: () => { setError(''); queryClient.invalidateQueries(['actualizaciones']) },
    onError: (e) => setError(e.message),
  })

  const version = data?.version
  const disponible = Boolean(data?.disponible)
  const aplicando = Boolean(data?.aplicando)
  const cambios = data?.cambios ?? []

  function confirmarAplicar() {
    const total = data?.atrasadas ?? cambios.length
    const texto = `Se descargarán e integrarán ${total} ${total === 1 ? 'cambio' : 'cambios'} del repositorio, se actualizará la base de datos y se recompilará la aplicación. Antes se hará una copia de seguridad. Durante el proceso la aplicación no estará disponible unos momentos. ¿Continuar?`
    if (window.confirm(texto)) {
      setError('')
      aplicar.mutate()
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-white">Actualizaciones</h2>
      <p className="mt-1 text-sm text-slate-400">
        Comprueba si hay versiones nuevas de la aplicación y actualízala desde aquí. La actualización solo avanza
        (fast-forward) sobre el repositorio git instalado en el servidor.
      </p>

      {!esAdmin && <div className="mt-5"><AvisoSoloAdmin /></div>}

      <section className="mt-6 space-y-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Versión instalada</h3>

        {version ? (
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-antracita-700 bg-antracita-900/60 px-4 py-3">
              <dt className="text-xs uppercase tracking-wide text-slate-500">Commit</dt>
              <dd className="mt-0.5 font-mono text-sm text-white">{version.corto}</dd>
            </div>
            <div className="rounded-lg border border-antracita-700 bg-antracita-900/60 px-4 py-3">
              <dt className="text-xs uppercase tracking-wide text-slate-500">Rama</dt>
              <dd className="mt-0.5 text-sm text-white">{version.rama}</dd>
            </div>
            <div className="rounded-lg border border-antracita-700 bg-antracita-900/60 px-4 py-3 sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-slate-500">Último cambio</dt>
              <dd className="mt-0.5 text-sm text-white">{version.mensaje || '—'}</dd>
              <dd className="text-xs text-slate-500">{formatearFechaHora(version.fecha)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-slate-400">Todavía no se ha comprobado la versión.</p>
        )}

        <p className="text-xs text-slate-500">
          Última comprobación: {formatearFechaHora(data?.ultimaComprobacion)}.
          {data?.remoto?.corto ? ` Última versión en el repositorio (origin/${data.version?.rama ?? 'main'}): ${data.remoto.corto}.` : ''}
          {data?.ultimaActualizacion?.fecha ? ` Última actualización aplicada: ${formatearFechaHora(data.ultimaActualizacion.fecha)}.` : ''}
        </p>

        {data && data.esRepositorio === false && (
          <p role="status" className="rounded-lg border border-naranja-500/30 bg-naranja-500/10 px-4 py-3 text-sm text-naranja-300">
            La aplicación no se ha instalado desde un repositorio git, así que no se pueden comprobar actualizaciones
            desde aquí. Actualiza el servidor con los pasos habituales de despliegue.
          </p>
        )}

        {(errorEstado || data?.ultimoError) && (
          <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {(errorEstado?.message) || data.ultimoError}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!esAdmin || comprobar.isLoading || aplicando}
            onClick={() => comprobar.mutate()}
            className="btn-secondary"
          >
            {comprobar.isLoading ? 'Comprobando…' : 'Comprobar ahora'}
          </button>
          <span className="text-sm text-slate-400">
            {disponible
              ? `Hay ${data.atrasadas} ${data.atrasadas === 1 ? 'cambio' : 'cambios'} por aplicar.`
              : data?.ultimaComprobacion
                ? 'La aplicación está al día.'
                : 'Todavía no se ha comprobado si hay actualizaciones. Pulsa «Comprobar ahora».'}
          </span>
        </div>
      </section>


      {disponible && (
        <section className="mt-8 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Cambios disponibles</h3>

          <ul className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-antracita-700 bg-antracita-900/60 p-3">
            {cambios.map((cambio) => (
              <li key={cambio.sha} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 shrink-0 rounded bg-antracita-800 px-1.5 py-0.5 font-mono text-xs text-slate-400">{cambio.corto}</span>
                <span className="min-w-0">
                  <span className="block truncate text-white">{cambio.mensaje}</span>
                  <span className="block text-xs text-slate-500">{formatearFechaHora(cambio.fecha)}</span>
                </span>
              </li>
            ))}
          </ul>

          {data.habilitadoAplicar ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!esAdmin || aplicando || aplicar.isLoading}
                onClick={confirmarAplicar}
                className="btn-primary"
              >
                {aplicando || aplicar.isLoading ? 'Actualizando…' : 'Actualizar ahora'}
              </button>
              <span className="text-sm text-slate-400">
                La aplicación se reiniciará sola al terminar.
              </span>
            </div>
          ) : (
            <p className="rounded-lg border border-antracita-700 bg-antracita-900/60 px-4 py-3 text-sm text-slate-400">
              La actualización desde la interfaz está deshabilitada en este servidor. Actualiza a mano:
              {' '}<code className="font-mono text-xs text-slate-300">git pull</code> y{' '}
              <code className="font-mono text-xs text-slate-300">bash deploy/install.sh</code>.
            </p>
          )}
        </section>
      )}

      {(aplicando || data?.pasos?.length > 0) && (
        <section className="mt-8 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Progreso</h3>

          <ul className="flex flex-wrap gap-2">
            {(data.pasos ?? []).map((paso) => (
              <li
                key={paso.clave}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${CLASE_PASO[paso.estado] ?? CLASE_PASO.pendiente}`}
              >
                {paso.etiqueta}
              </li>
            ))}
          </ul>

          {data.log?.length > 0 && (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-antracita-700 bg-antracita-950 p-3 font-mono text-xs text-slate-300">
              {data.log.join('\n')}
            </pre>
          )}

          {data.resultado && !data.resultado.ok && (
            <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              La actualización no se pudo completar: {data.resultado.error}
            </p>
          )}
          {data.resultado?.ok && (
            <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              Actualización aplicada correctamente. La aplicación se reiniciará en unos segundos.
            </p>
          )}
        </section>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </p>
      )}

      <section className="mt-8 space-y-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Comprobación automática</h3>

        <div className="flex items-center justify-between gap-4">
          <label htmlFor="actualizaciones-activas" className="text-sm text-slate-300">
            Comprobar actualizaciones periódicamente y avisar
          </label>
          <Interruptor
            id="actualizaciones-activas"
            etiqueta="Activar la comprobación automática de actualizaciones"
            checked={activas}
            onChange={(valor) => actualizar('actualizacionesActivas', valor)}
            disabled={!esAdmin}
          />
        </div>

        <label className="block max-w-xs">
          <span className="label">Comprobar cada</span>
          <div className="mt-1.5 flex items-center gap-3">
            <input
              type="number"
              min="1"
              max="168"
              step="1"
              inputMode="numeric"
              value={borrador.actualizacionesHoras ?? ''}
              onChange={(event) => actualizar('actualizacionesHoras', aNumero(event.target.value))}
              disabled={!esAdmin || !activas}
              className="input w-24"
            />
            <span className="text-sm text-slate-400">horas</span>
          </div>
        </label>

        <p className="rounded-lg border border-antracita-700 bg-antracita-900/60 px-4 py-3 text-sm text-slate-400">
          La comprobación solo consulta el repositorio (nunca aplica cambios sola). Cuando hay una actualización
          disponible, los administradores ven un aviso en la parte superior de la aplicación.
        </p>
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


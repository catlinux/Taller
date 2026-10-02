import { AvisoSoloAdmin, PieGuardar, usePanelAjustes } from './comunes.jsx'

const CLAVES = ['precioHora', 'ivaDefecto', 'diasValidezPresupuesto', 'clausulaRgpd']

// Tipos de IVA que ofrece el selector (los habituales en España).
const TIPOS_IVA = [0, 4, 10, 21]

// Texto de la cláusula RGPD por defecto. {empresa} y {email} se sustituyen por
// los datos de la empresa al imprimir el PDF.
const CLAUSULA_POR_DEFECTO =
  'Sus datos personales se tratan conforme al Reglamento (UE) 2016/679 (RGPD) para gestionar la reparación. ' +
  'Puede ejercer sus derechos dirigiéndose a {empresa} ({email}).'

// Convierte el texto de un input numérico en número (o '' si está vacío).
const aNumero = (valor) => (valor === '' ? '' : Number(valor))

export default function TallerPanel() {
  const { borrador, actualizar, descartar, guardar, hayCambios, estado, mensaje, esAdmin, guardando } =
    usePanelAjustes(CLAVES)

  return (
    <div>
      <h2 className="text-lg font-semibold text-white">Taller</h2>
      <p className="mt-1 text-sm text-slate-400">Valores por defecto que se aplican al crear líneas y documentos.</p>

      {!esAdmin && <div className="mt-5"><AvisoSoloAdmin /></div>}

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="label">Precio por hora por defecto (€)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={borrador.precioHora ?? ''}
            onChange={(event) => actualizar('precioHora', aNumero(event.target.value))}
            disabled={!esAdmin}
            className="input mt-1.5"
          />
          <span className="mt-1.5 block text-xs text-slate-500">Se propone al añadir una línea de mano de obra libre.</span>
        </label>

        <label className="block">
          <span className="label">IVA por defecto</span>
          <select
            value={borrador.ivaDefecto ?? 21}
            onChange={(event) => actualizar('ivaDefecto', Number(event.target.value))}
            disabled={!esAdmin}
            className="input mt-1.5"
          >
            {TIPOS_IVA.map((tipo) => (
              <option key={tipo} value={tipo}>{tipo} %</option>
            ))}
          </select>
          <span className="mt-1.5 block text-xs text-slate-500">Se aplica a las líneas de material sin IVA propio.</span>
        </label>

        <label className="block">
          <span className="label">Validez del presupuesto (días)</span>
          <input
            type="number"
            min="1"
            max="365"
            step="1"
            inputMode="numeric"
            value={borrador.diasValidezPresupuesto ?? ''}
            onChange={(event) => actualizar('diasValidezPresupuesto', aNumero(event.target.value))}
            disabled={!esAdmin}
            className="input mt-1.5"
          />
          <span className="mt-1.5 block text-xs text-slate-500">Se imprime bajo los totales del documento.</span>
        </label>
      </div>

      <div className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label htmlFor="clausula-rgpd" className="label">
            Cláusula de protección de datos (pie de los documentos)
          </label>
          <button
            type="button"
            onClick={() => actualizar('clausulaRgpd', CLAUSULA_POR_DEFECTO)}
            disabled={!esAdmin}
            className="btn-secondary"
          >
            Restaurar texto por defecto
          </button>
        </div>
        <textarea
          id="clausula-rgpd"
          rows={4}
          value={borrador.clausulaRgpd ?? ''}
          onChange={(event) => actualizar('clausulaRgpd', event.target.value)}
          disabled={!esAdmin}
          className="input mt-1.5 font-mono text-sm"
        />
        <p className="mt-1.5 text-xs text-slate-500">
          Puedes usar {'{empresa}'} y {'{email}'}, que se sustituyen por los datos de la empresa del documento.
        </p>
      </div>

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

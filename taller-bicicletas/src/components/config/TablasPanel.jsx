import { AvisoSoloAdmin, PieGuardar, usePanelAjustes } from './comunes.jsx'
import { VALORES_FILAS_POR_PAGINA } from '../../lib/ajustes.js'

const CLAVES = ['filasPorPagina']

export default function TablasPanel() {
  const { borrador, actualizar, descartar, guardar, hayCambios, estado, mensaje, esAdmin, guardando } =
    usePanelAjustes(CLAVES)

  return (
    <div>
      <h2 className="text-lg font-semibold text-white">Tablas</h2>
      <p className="mt-1 text-sm text-slate-400">Cómo se muestran los listados de la aplicación.</p>

      {!esAdmin && <div className="mt-5"><AvisoSoloAdmin /></div>}

      <div className="mt-5 max-w-sm">
        <label className="block">
          <span className="label">Filas por página en los listados</span>
          <select
            value={borrador.filasPorPagina ?? ''}
            onChange={(event) => actualizar('filasPorPagina', Number(event.target.value))}
            disabled={!esAdmin}
            className="input mt-1.5"
          >
            {VALORES_FILAS_POR_PAGINA.map((valor) => (
              <option key={valor} value={valor}>{valor} filas</option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-xs text-slate-500">
          Se aplica a todas las tablas de la aplicación; cada tabla recuerda además la página en la que estabas.
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

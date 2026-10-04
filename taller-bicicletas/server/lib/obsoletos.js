// Cálculo de artículos obsoletos: sin stock y/o sin movimientos.
//
// El «movimiento» de un artículo es aparecer en una línea de material
// (OrdenMaterial) de una orden de reparación; la fecha del movimiento es la
// fecha de entrada de esa orden (OrdenReparacion.fechaEntrada). El stock es
// solo informativo y puede ser negativo en datos importados.
//
// `filtrarObsoletos` es una función pura: recibe los artículos y los movimientos
// ya consultados y devuelve únicamente las filas que cumplen los filtros,
// ordenadas por defecto por último movimiento ascendente (nunca usados primero)
// y luego por referencia.

import { coincideTexto } from './texto.js'

const DIA_MS = 24 * 60 * 60 * 1000

// Convierte un valor (Date o cadena) en una fecha válida; null si no lo es.
function aFecha(valor) {
  if (valor instanceof Date) return Number.isFinite(valor.getTime()) ? valor : null
  if (valor === null || valor === undefined || valor === '') return null
  const fecha = new Date(valor)
  return Number.isFinite(fecha.getTime()) ? fecha : null
}

// Acepta un entero mayor o igual que 0; null si el valor no es válido o falta.
function aDias(valor) {
  if (valor === null || valor === undefined || valor === '') return null
  const num = Number(valor)
  return Number.isInteger(num) && num >= 0 ? num : null
}

// Compara dos referencias de forma natural (con números) e insensible a mayúsculas.
function compararReferencia(a, b) {
  return String(a.referencia ?? '').localeCompare(String(b.referencia ?? ''), 'es', { numeric: true, sensitivity: 'base' })
}

export function filtrarObsoletos(articulos = [], movimientos = [], opciones = {}, ahora = new Date()) {
  const sinStockDias = aDias(opciones.sinStockDias)
  const sinMovimientosDias = aDias(opciones.sinMovimientosDias)
  const incluirNuncaUsados = opciones.incluirNuncaUsados !== false
  const termino = typeof opciones.q === 'string' && opciones.q.trim() ? opciones.q.trim() : null
  const familia = typeof opciones.familia === 'string' && opciones.familia.trim() ? opciones.familia.trim() : null
  const limite = Number.isInteger(opciones.limite) && opciones.limite > 0 ? opciones.limite : null

  // Resumen de movimientos por artículo: número de líneas (usos) y fecha del último.
  const resumen = new Map()
  for (const movimiento of movimientos) {
    const id = movimiento?.articuloId
    if (id === null || id === undefined) continue
    const acumulado = resumen.get(id) ?? { usos: 0, ultimo: null }
    acumulado.usos += 1
    const fecha = aFecha(movimiento?.orden?.fechaEntrada)
    if (fecha && (acumulado.ultimo === null || fecha > acumulado.ultimo)) acumulado.ultimo = fecha
    resumen.set(id, acumulado)
  }

  // Cortes de tiempo (solo si el filtro correspondiente viene informado).
  const corteStock = sinStockDias === null ? null : new Date(ahora.getTime() - sinStockDias * DIA_MS)
  const corteMovimientos = sinMovimientosDias === null ? null : new Date(ahora.getTime() - sinMovimientosDias * DIA_MS)

  const filas = []
  for (const articulo of articulos) {
    const info = resumen.get(articulo.id) ?? { usos: 0, ultimo: null }

    // Filtro «sin stock desde hace al menos N días»: stock <= 0 y, si N > 0,
    // la fecha sinStockDesde anterior o igual al corte (0 = cualquiera sin stock).
    if (corteStock !== null) {
      if (!(Number(articulo.stock) <= 0)) continue
      if (sinStockDias > 0) {
        const desde = aFecha(articulo.sinStockDesde)
        if (desde === null || desde > corteStock) continue
      }
    }

    // Filtro «sin movimientos desde hace al menos N días»: último movimiento en
    // o antes del corte, o nunca usado cuando incluirNuncaUsados sea true.
    if (corteMovimientos !== null) {
      if (info.usos === 0) {
        if (!incluirNuncaUsados) continue
      } else if (info.ultimo !== null && info.ultimo > corteMovimientos) {
        continue
      }
    }

    // Búsqueda por referencia o descripción (ignora mayúsculas y acentos).
    if (termino !== null) {
      if (!coincideTexto([articulo.referencia, articulo.descripcion], termino)) continue
    }

    // Filtro por familia (coincidencia exacta).
    if (familia !== null && (articulo.familia ?? null) !== familia) continue

    filas.push({
      id: articulo.id,
      referencia: articulo.referencia,
      descripcion: articulo.descripcion,
      familia: articulo.familia ?? null,
      proveedor: articulo.proveedor ?? null,
      stock: articulo.stock,
      sinStockDesde: articulo.sinStockDesde ?? null,
      ultimoMovimiento: info.ultimo === null ? null : info.ultimo.toISOString(),
      usos: info.usos,
    })
  }

  // Orden por defecto: último movimiento ascendente (nulos primero) y luego referencia.
  filas.sort((a, b) => {
    if (a.ultimoMovimiento === null && b.ultimoMovimiento === null) return compararReferencia(a, b)
    if (a.ultimoMovimiento === null) return -1
    if (b.ultimoMovimiento === null) return 1
    const diferencia = new Date(a.ultimoMovimiento).getTime() - new Date(b.ultimoMovimiento).getTime()
    return diferencia !== 0 ? diferencia : compararReferencia(a, b)
  })

  return limite === null ? filas : filas.slice(0, limite)
}

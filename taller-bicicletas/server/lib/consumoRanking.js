import { aFecha, aNumero, redondear4, semanaIso } from './consumo.js'
import { inicioDePeriodo, finDePeriodo, inicioAnterior, aIso } from './consumoSerie.js'

// Ranking de consumo por producto dentro de un periodo: sirve para la gráfica
// comparativa de «Artículos > Consumo» (qué productos se gastan más y cuáles
// tienen más demanda). Reutiliza los helpers de periodo de consumoSerie.js (la
// semana ISO empieza en lunes, los meses y trimestres son naturales y todo se
// calcula en hora local).

// Agrupaciones admitidas por el ranking.
export const AGRUPACIONES_RANKING = ['semana', 'mes', 'trimestre', 'anio']

// Métricas con las que se puede ordenar el ranking.
export const METRICAS_RANKING = ['unidades', 'importe', 'ordenes']

// Límites permitidos para el número de productos mostrados.
export const LIMITE_MINIMO = 1
export const LIMITE_MAXIMO = 50

// Nombres de los meses en español (en minúscula, como en las etiquetas).
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// Dos dígitos con cero a la izquierda.
function dosDigitos(valor) {
  return String(valor).padStart(2, '0')
}

// Redondea a 1 decimal (para las variaciones porcentuales).
function redondear1(valor) {
  return Math.round(valor * 10) / 10
}

// Etiqueta legible del periodo de `fecha` según la agrupación:
// semana ('Semana 40 · 28/09 – 04/10/2026'), mes ('octubre 2026'),
// trimestre ('T4 2026') y año ('2026').
function etiquetaDelPeriodo(fecha, agrupar) {
  if (agrupar === 'semana') {
    const inicio = inicioDePeriodo(fecha, 'semana')
    const fin = finDePeriodo(inicio, 'semana')
    const { semana } = semanaIso(fecha)
    return `Semana ${semana} · ${dosDigitos(inicio.getDate())}/${dosDigitos(inicio.getMonth() + 1)} – ${dosDigitos(fin.getDate())}/${dosDigitos(fin.getMonth() + 1)}/${fin.getFullYear()}`
  }
  if (agrupar === 'mes') return `${MESES_LARGOS[fecha.getMonth()]} ${fecha.getFullYear()}`
  if (agrupar === 'trimestre') return `T${Math.floor(fecha.getMonth() / 3) + 1} ${fecha.getFullYear()}`
  return String(fecha.getFullYear())
}

// Valor de la métrica pedida para el agregado de un artículo.
function valorDeMetrica(agregado, metrica) {
  if (metrica === 'importe') return agregado.importe
  if (metrica === 'ordenes') return agregado.ordenes.size
  return agregado.cantidad
}

// Agrupa por referencia las líneas que caen dentro de [desde, hasta] (ambos
// inclusive). De cada artículo guarda la cantidad, el importe y el conjunto de
// órdenes distintas, y la descripción y la familia de su línea más reciente.
// Devuelve además los totales del periodo (de todos los artículos).
function agregarPorArticulo(lineas, desde, hasta) {
  const mapa = new Map()
  const ordenesGlobal = new Set()
  let cantidadTotal = 0
  let importeTotal = 0
  // `hasta` es un día a las 00:00: el límite real es el comienzo del día siguiente,
  // para no perder las líneas con hora del último día del periodo.
  const limiteExclusivo = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate() + 1)

  for (const linea of lineas ?? []) {
    const fecha = aFecha(linea?.fecha)
    if (fecha === null) continue
    if (fecha < desde || fecha >= limiteExclusivo) continue

    const referencia = linea.referencia === null || linea.referencia === undefined ? '' : String(linea.referencia)
    let agregado = mapa.get(referencia)
    if (!agregado) {
      agregado = { cantidad: 0, importe: 0, ordenes: new Set(), descripcion: null, familia: null, fechaReciente: null }
      mapa.set(referencia, agregado)
    }

    const cantidad = aNumero(linea.cantidad)
    const importe = aNumero(linea.precioNeto)
    agregado.cantidad += cantidad
    agregado.importe += importe
    if (linea.ordenId !== null && linea.ordenId !== undefined) {
      agregado.ordenes.add(linea.ordenId)
      ordenesGlobal.add(linea.ordenId)
    }
    // Descripción y familia de la línea más reciente del artículo.
    if (agregado.fechaReciente === null || fecha > agregado.fechaReciente) {
      agregado.fechaReciente = fecha
      agregado.descripcion = linea.descripcion ?? null
      agregado.familia = linea.familia ?? null
    }

    cantidadTotal += cantidad
    importeTotal += importe
  }

  return { mapa, cantidadTotal, importeTotal, ordenes: ordenesGlobal }
}

// Ranking de consumo por producto en el periodo que contiene `fecha`.
//   - lineas: { referencia, descripcion, familia, cantidad, precioNeto, fecha,
//               ordenId }
//   - opciones: { agrupar, fecha, metrica, limite, hoy }
// Devuelve { agrupar, metrica, limite, fecha, desde, hasta, etiqueta,
// anteriorDesde, anteriorHasta, fechaAnterior, fechaSiguiente, esActual, items,
// totales, totalArticulos, valorTotal }. Cada ítem incluye `anterior` (valor de
// la misma métrica en el periodo anterior) y `variacion` (porcentaje de cambio,
// o null si no había valor previo).
export function rankingConsumo(lineas = [], opciones = {}) {
  const agrupar = opciones.agrupar
  if (!AGRUPACIONES_RANKING.includes(agrupar)) {
    throw new Error('agrupar debe ser uno de: semana, mes, trimestre, anio')
  }
  const metrica = opciones.metrica
  if (!METRICAS_RANKING.includes(metrica)) {
    throw new Error('metrica debe ser una de: unidades, importe, ordenes')
  }
  const limite = opciones.limite === undefined ? 10 : opciones.limite
  if (!Number.isInteger(limite) || limite < LIMITE_MINIMO || limite > LIMITE_MAXIMO) {
    throw new Error(`limite debe ser un entero entre ${LIMITE_MINIMO} y ${LIMITE_MAXIMO}`)
  }

  const hoy = aFecha(opciones.hoy) ?? new Date()
  // `fecha` (día del periodo a mostrar) es hoy por defecto.
  const fecha = aFecha(opciones.fecha) ?? hoy

  // Periodo mostrado, periodo anterior y primer día del periodo siguiente
  // (para la navegación entre periodos).
  const inicio = inicioDePeriodo(fecha, agrupar)
  const fin = finDePeriodo(inicio, agrupar)
  const inicioAnt = inicioAnterior(inicio, agrupar)
  const finAnt = finDePeriodo(inicioAnt, agrupar)
  const inicioSig = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate() + 1)

  const hoyDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const esActual = hoyDia >= inicio && hoyDia <= fin

  const actuales = agregarPorArticulo(lineas, inicio, fin)
  const anteriores = agregarPorArticulo(lineas, inicioAnt, finAnt)

  const items = []
  for (const [referencia, agregado] of actuales.mapa.entries()) {
    const valor = redondear4(valorDeMetrica(agregado, metrica))
    const previo = anteriores.mapa.get(referencia)
    const anterior = redondear4(previo ? valorDeMetrica(previo, metrica) : 0)
    const variacion = anterior === 0 ? null : redondear1(((valor - anterior) / anterior) * 100)
    items.push({
      referencia,
      descripcion: agregado.descripcion,
      familia: agregado.familia,
      cantidad: redondear4(agregado.cantidad),
      importe: redondear4(agregado.importe),
      ordenes: agregado.ordenes.size,
      valor,
      anterior,
      variacion,
    })
  }

  // De mayor a menor por la métrica; a igualdad, cantidad desc y referencia asc.
  items.sort((a, b) => {
    if (b.valor !== a.valor) return b.valor - a.valor
    if (b.cantidad !== a.cantidad) return b.cantidad - a.cantidad
    return String(a.referencia).localeCompare(String(b.referencia), 'es', { numeric: true, sensitivity: 'base' })
  })

  // Suma de la métrica de todos los artículos (para el % de cada uno).
  const valorTotal = redondear4(items.reduce((total, item) => total + item.valor, 0))

  return {
    agrupar,
    metrica,
    limite,
    fecha: aIso(fecha),
    desde: aIso(inicio),
    hasta: aIso(fin),
    etiqueta: etiquetaDelPeriodo(fecha, agrupar),
    anteriorDesde: aIso(inicioAnt),
    anteriorHasta: aIso(finAnt),
    fechaAnterior: aIso(inicioAnt),
    fechaSiguiente: aIso(inicioSig),
    esActual,
    items: items.slice(0, limite),
    totales: {
      cantidad: redondear4(actuales.cantidadTotal),
      importe: redondear4(actuales.importeTotal),
      ordenes: actuales.ordenes.size,
      articulos: actuales.mapa.size,
    },
    totalArticulos: actuales.mapa.size,
    valorTotal,
  }
}

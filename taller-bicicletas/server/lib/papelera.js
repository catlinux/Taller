// Papelera: guarda una instantánea de cada registro borrado para poder
// deshacerlo. Las instantáneas viajan en JSON (con las fechas en ISO) y al
// restaurar se devuelven a su tipo original (Date). La restauración reutiliza
// los identificadores originales para que las relaciones (líneas de una orden,
// bicicletas de un cliente...) queden enlazadas otra vez.

// Campos DateTime del esquema que hay que revivir (ISO -> Date) al restaurar.
const CAMPOS_FECHA = ['createdAt', 'updatedAt', 'fechaEntrada', 'fechaPrevista', 'sinStockDesde']

// Error de negocio: la restauración no es posible (conflicto o falta el padre).
// Lleva un `status` HTTP para que la ruta responda con un código coherente.
export class ErrorPapelera extends Error {
  constructor(mensaje, status = 409) {
    super(mensaje)
    this.name = 'ErrorPapelera'
    this.status = status
  }
}

// Serializa los datos de una entrada (JSON, con las fechas en ISO).
export function serializarDatos(datos) {
  return JSON.stringify(datos)
}

// Revive de forma recursiva los campos DateTime de una instantánea.
function revivirFechas(valor) {
  if (Array.isArray(valor)) return valor.map(revivirFechas)
  if (valor && typeof valor === 'object') {
    const resultado = {}
    for (const [clave, contenido] of Object.entries(valor)) {
      if (CAMPOS_FECHA.includes(clave) && typeof contenido === 'string') {
        const fecha = new Date(contenido)
        resultado[clave] = Number.isNaN(fecha.getTime()) ? null : fecha
      } else {
        resultado[clave] = revivirFechas(contenido)
      }
    }
    return resultado
  }
  return valor
}

// Deserializa la instantánea JSON y convierte las fechas a Date.
export function deserializarDatos(texto) {
  return revivirFechas(JSON.parse(texto))
}

// ── Descripciones legibles (las muestra la interfaz y la propia papelera) ──
export function descripcionCliente(cliente) {
  const nombre = [cliente.nombre, cliente.apellidos].filter(Boolean).join(' ')
  return `Cliente #${cliente.numeroCliente} ${nombre}`.trim()
}
export function descripcionBicicleta(bicicleta) {
  return `Bicicleta ${[bicicleta.marca, bicicleta.modelo].filter(Boolean).join(' ')}`.trim()
}
export function descripcionArticulo(articulo) {
  return `Artículo ${articulo.referencia} ${articulo.descripcion}`.trim()
}
export function descripcionOrden(orden) {
  return `Orden ${orden.numeroOrden}`
}
export function descripcionLineaMaterial(linea, numeroOrden) {
  const sufijo = numeroOrden ? ` (${numeroOrden})` : ''
  return `Línea de material: ${linea.descripcion}${sufijo}`
}
export function descripcionLineaManoObra(linea, numeroOrden) {
  const sufijo = numeroOrden ? ` (${numeroOrden})` : ''
  return `Línea de mano de obra: ${linea.descripcion}${sufijo}`
}
export function descripcionOperacion(operacion) {
  return `Operación ${operacion.codigo} ${operacion.descripcion}`.trim()
}
export function descripcionMecanico(mecanico) {
  return `Mecánico ${mecanico.nombre}`
}

// Guarda una instantánea en la papelera. Acepta tanto el cliente de Prisma como
// una transacción (`tx`), para poder borrar y archivar de forma atómica.
export async function guardarEnPapelera(db, { tipo, descripcion, datos, usuario }) {
  return db.papelera.create({
    data: {
      tipo,
      descripcion,
      datos: serializarDatos(datos),
      usuario: usuario ?? null,
    },
  })
}

// Borra las entradas más antiguas que `dias` (por defecto 30). Devuelve cuántas
// se han borrado.
export async function purgarAntiguas(prisma, dias = 30) {
  const limite = new Date(Date.now() - dias * 24 * 60 * 60 * 1000)
  const { count } = await prisma.papelera.deleteMany({ where: { createdAt: { lt: limite } } })
  return count
}

// Recrea el registro (y lo que colgaba de él) a partir de la instantánea. Se
// hace dentro de una transacción: si algo falla, no se deja nada a medias. Al
// terminar borra la propia entrada de la papelera (también en la transacción).
export async function restaurarEntrada(prisma, entrada) {
  const datos = deserializarDatos(entrada.datos)
  try {
    await prisma.$transaction(async (tx) => {
      await restaurarPorTipo(tx, entrada.tipo, datos)
      await tx.papelera.delete({ where: { id: entrada.id } })
    })
  } catch (error) {
    if (error instanceof ErrorPapelera) throw error
    // Clave única repetida (mismo número de cliente, misma referencia...).
    if (error?.code === 'P2002') {
      throw new ErrorPapelera('No se puede restaurar: ya existe otro registro con los mismos datos (mismo número, referencia o nombre).')
    }
    // Falta un registro relacionado (clave foránea).
    if (error?.code === 'P2003') {
      throw new ErrorPapelera('No se puede restaurar porque falta un registro relacionado del que dependía.')
    }
    throw error
  }
}

async function restaurarPorTipo(tx, tipo, datos) {
  switch (tipo) {
    case 'cliente': return restaurarCliente(tx, datos)
    case 'bicicleta': return restaurarBicicleta(tx, datos)
    case 'articulo': return restaurarArticulo(tx, datos)
    case 'articulos-lote': return restaurarArticulosLote(tx, datos)
    case 'orden': return restaurarOrden(tx, datos)
    case 'material-orden': return restaurarLineaMaterial(tx, datos)
    case 'mano-obra-orden': return restaurarLineaManoObra(tx, datos)
    case 'operacion': return restaurarOperacion(tx, datos)
    case 'mecanico': return restaurarMecanico(tx, datos)
    default:
      throw new ErrorPapelera(`No se sabe restaurar el tipo «${tipo}».`, 400)
  }
}

// Cliente y, en cascada, sus bicicletas.
async function restaurarCliente(tx, { cliente, bicicletas = [] }) {
  await tx.cliente.create({ data: cliente })
  for (const bicicleta of bicicletas) {
    await tx.bicicleta.create({ data: bicicleta })
  }
}

async function restaurarBicicleta(tx, { bicicleta }) {
  const cliente = await tx.cliente.findUnique({ where: { id: bicicleta.clienteId } })
  if (!cliente) throw new ErrorPapelera('No se puede restaurar la bicicleta porque su cliente ya no existe.')
  await tx.bicicleta.create({ data: bicicleta })
}

// Artículo y el reenlazado de las líneas de orden que lo usaban (que quedaron
// con articuloId a null al borrarlo).
async function restaurarArticulo(tx, { articulo, lineas = [] }) {
  await tx.articulo.create({ data: articulo })
  if (lineas.length > 0) {
    await tx.ordenMaterial.updateMany({
      where: { id: { in: lineas }, articuloId: null },
      data: { articuloId: articulo.id },
    })
  }
}

async function restaurarArticulosLote(tx, { articulos = [] }) {
  for (const { articulo, lineas = [] } of articulos) {
    await restaurarArticulo(tx, { articulo, lineas })
  }
}

// Orden con sus líneas de materiales y de mano de obra.
async function restaurarOrden(tx, { orden, materiales = [], manoObra = [] }) {
  const cliente = await tx.cliente.findUnique({ where: { id: orden.clienteId } })
  if (!cliente) throw new ErrorPapelera('No se puede restaurar la orden porque su cliente ya no existe.')
  if (orden.bicicletaId) {
    const bicicleta = await tx.bicicleta.findUnique({ where: { id: orden.bicicletaId } })
    if (!bicicleta) throw new ErrorPapelera('No se puede restaurar la orden porque su bicicleta ya no existe.')
  }
  if (orden.mecanicoId) {
    const mecanico = await tx.mecanico.findUnique({ where: { id: orden.mecanicoId } })
    if (!mecanico) throw new ErrorPapelera('No se puede restaurar la orden porque su mecánico ya no existe.')
  }
  await tx.ordenReparacion.create({ data: orden })
  for (const material of materiales) {
    await tx.ordenMaterial.create({ data: await prepararMaterial(tx, material) })
  }
  for (const linea of manoObra) {
    await tx.ordenManoObra.create({ data: linea })
  }
}

// Si el artículo de una línea ya no existe, la línea se recrea sin el enlace
// (conserva referencia y descripción), igual que cuando se borra un artículo.
async function prepararMaterial(tx, material) {
  const datos = { ...material }
  if (datos.articuloId) {
    const articulo = await tx.articulo.findUnique({ where: { id: datos.articuloId } })
    if (!articulo) datos.articuloId = null
  }
  return datos
}

async function restaurarLineaMaterial(tx, { linea }) {
  const orden = await tx.ordenReparacion.findUnique({ where: { id: linea.ordenId } })
  if (!orden) throw new ErrorPapelera('No se puede restaurar la línea porque su orden ya no existe.')
  await tx.ordenMaterial.create({ data: await prepararMaterial(tx, linea) })
  await recalcularTotalesOrden(tx, linea.ordenId)
}

async function restaurarLineaManoObra(tx, { linea }) {
  const orden = await tx.ordenReparacion.findUnique({ where: { id: linea.ordenId } })
  if (!orden) throw new ErrorPapelera('No se puede restaurar la línea porque su orden ya no existe.')
  await tx.ordenManoObra.create({ data: linea })
  await recalcularTotalesOrden(tx, linea.ordenId)
}

// Recalcula y guarda los totales de una orden a partir de sus líneas. Replica la
// fórmula de la ruta de órdenes para que una línea restaurada no deje los
// importes descuadrados (el alta de líneas sí los recalcula).
const IVA_MANO_OBRA = 21

function redondear2(value) {
  const escalado = Number(`${Number(value.toFixed(8))}e2`)
  return (Number.isFinite(escalado) ? Math.round(escalado) : Math.round(value * 100)) / 100
}

async function recalcularTotalesOrden(tx, ordenId) {
  const orden = await tx.ordenReparacion.findUnique({ where: { id: ordenId } })
  const materiales = await tx.ordenMaterial.findMany({ where: { ordenId } })
  const manoObra = await tx.ordenManoObra.findMany({ where: { ordenId } })

  let subtotalMateriales = 0
  let ivaMateriales = 0
  for (const material of materiales) {
    subtotalMateriales += material.precioNeto
    ivaMateriales += material.precioNeto * (material.iva / 100)
  }
  const subtotalManoObra = manoObra.reduce((total, linea) => total + linea.importe, 0)

  const factor = 1 - orden.descuentoGlobal / 100
  const baseImponible = redondear2((subtotalMateriales + subtotalManoObra) * factor)
  const iva = redondear2((ivaMateriales + subtotalManoObra * (IVA_MANO_OBRA / 100)) * factor)
  const total = redondear2(baseImponible + iva)

  await tx.ordenReparacion.update({
    where: { id: ordenId },
    data: {
      subtotalMateriales: redondear2(subtotalMateriales),
      subtotalManoObra: redondear2(subtotalManoObra),
      baseImponible,
      iva,
      total,
    },
  })
}

async function restaurarOperacion(tx, { operacion }) {
  await tx.operacionManoObra.create({ data: operacion })
}

async function restaurarMecanico(tx, { mecanico }) {
  await tx.mecanico.create({ data: mecanico })
}

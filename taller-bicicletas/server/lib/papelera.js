import { normalizarEstado } from './estados.js'


// Papelera: guarda una instantánea de cada registro borrado para poder
// deshacerlo. Las instantáneas viajan en JSON (con las fechas en ISO) y al
// restaurar se devuelven a su tipo original (Date). La restauración reutiliza
// los identificadores originales para que las relaciones (líneas de una orden,
// bicicletas de un cliente...) queden enlazadas otra vez.

// Campos DateTime del esquema que hay que revivir (ISO -> Date) al restaurar.
const CAMPOS_FECHA = ['createdAt', 'updatedAt', 'fechaEntrada', 'fechaPrevista', 'fechaFinalizacion', 'exportadaFactusolEn', 'sinStockDesde']

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
  // Si algo ya está ocupado (número de cliente, referencia, nombre...), el registro
  // se restaura con el siguiente valor libre y se deja constancia en `avisos`.
  const avisos = []
  try {
    await prisma.$transaction(async (tx) => {
      await restaurarPorTipo(tx, entrada.tipo, datos, avisos)
      await tx.papelera.delete({ where: { id: entrada.id } })
    })
    return { avisos }
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

async function restaurarPorTipo(tx, tipo, datos, avisos) {
  switch (tipo) {
    case 'cliente': return restaurarCliente(tx, datos, avisos)
    case 'bicicleta': return restaurarBicicleta(tx, datos)
    case 'articulo': return restaurarArticulo(tx, datos, avisos)
    case 'articulos-lote': return restaurarArticulosLote(tx, datos, avisos)
    case 'orden': return restaurarOrden(tx, datos, avisos)
    case 'material-orden': return restaurarLineaMaterial(tx, datos)
    case 'mano-obra-orden': return restaurarLineaManoObra(tx, datos)
    case 'operacion': return restaurarOperacion(tx, datos, avisos)
    case 'mecanico': return restaurarMecanico(tx, datos, avisos)
    default:
      throw new ErrorPapelera(`No se sabe restaurar el tipo «${tipo}».`, 400)
  }
}

// Si el id original ya lo usa otro registro (no debería pasar: SQLite no reutiliza
// ids), se deja que la base asigne uno nuevo.
async function idLibre(modelo, id) {
  if (id === undefined || id === null) return false
  return (await modelo.findUnique({ where: { id } })) === null
}

// Primer valor libre a partir del original: si `base` está libre se devuelve tal cual;
// si no, se sube el número final conservando los ceros (CAM-0002 -> CAM-0003 ->
// CAM-0004...); si no acaba en número, se añade un sufijo (`formato`, por defecto
// «-2», «-3»...). `existe` indica si un valor ya está ocupado.
export async function siguienteTextoLibre(base, existe, formato = (b, n) => `${b}-${n}`) {
  if (!(await existe(base))) return base
  const final = /^(.*?)(\d+)$/.exec(base)
  if (final) {
    const ancho = final[2].length
    let n = BigInt(final[2])
    for (let i = 0; i < 100000; i += 1) {
      n += 1n
      const candidato = final[1] + String(n).padStart(ancho, '0')
      if (!(await existe(candidato))) return candidato
    }
  } else {
    for (let n = 2; n < 10000; n += 1) {
      const candidato = formato(base, n)
      if (!(await existe(candidato))) return candidato
    }
  }
  throw new ErrorPapelera('No se ha encontrado un valor libre para restaurar el registro.')
}

// Cliente y, en cascada, sus bicicletas. Si su número de cliente ya lo usa otro,
// vuelve con el siguiente número libre.
async function restaurarCliente(tx, { cliente, bicicletas = [] }, avisos = []) {
  const datos = { ...cliente }
  const ocupado = await tx.cliente.findUnique({ where: { numeroCliente: datos.numeroCliente } })
  if (ocupado) {
    let nuevo = datos.numeroCliente + 1
    while (await tx.cliente.findUnique({ where: { numeroCliente: nuevo } })) nuevo += 1
    avisos.push(`El nº de cliente ${datos.numeroCliente} ya lo usa otro cliente: se ha restaurado como nº ${nuevo}.`)
    datos.numeroCliente = nuevo
  }
  if (!(await idLibre(tx.cliente, datos.id))) delete datos.id
  const creado = await tx.cliente.create({ data: datos })
  for (const bicicleta of bicicletas) {
    const datosBici = { ...bicicleta, clienteId: creado.id }
    if (!(await idLibre(tx.bicicleta, datosBici.id))) delete datosBici.id
    await tx.bicicleta.create({ data: datosBici })
  }
}

async function restaurarBicicleta(tx, { bicicleta }) {
  const cliente = await tx.cliente.findUnique({ where: { id: bicicleta.clienteId } })
  if (!cliente) throw new ErrorPapelera('No se puede restaurar la bicicleta porque su cliente ya no existe. Restaura primero al cliente si está en la papelera.')
  const datos = { ...bicicleta }
  if (!(await idLibre(tx.bicicleta, datos.id))) delete datos.id
  await tx.bicicleta.create({ data: datos })
}

// Artículo y el reenlazado de las líneas de orden que lo usaban (que quedaron
// con articuloId a null al borrarlo).
// Si su referencia ya la usa otro artículo, vuelve con la siguiente libre (REF-2...).
async function restaurarArticulo(tx, { articulo, lineas = [] }, avisos = []) {
  const datos = { ...articulo }
  const referencia = await siguienteTextoLibre(
    datos.referencia,
    async (ref) => (await tx.articulo.findUnique({ where: { referencia: ref } })) !== null,
  )
  if (referencia !== datos.referencia) {
    avisos.push(`La referencia ${datos.referencia} ya la usa otro artículo: se ha restaurado como ${referencia}.`)
    datos.referencia = referencia
  }
  if (!(await idLibre(tx.articulo, datos.id))) delete datos.id
  const creado = await tx.articulo.create({ data: datos })
  if (lineas.length > 0) {
    await tx.ordenMaterial.updateMany({
      where: { id: { in: lineas }, articuloId: null },
      data: { articuloId: creado.id },
    })
  }
}

async function restaurarArticulosLote(tx, { articulos = [] }, avisos = []) {
  for (const { articulo, lineas = [] } of articulos) {
    await restaurarArticulo(tx, { articulo, lineas }, avisos)
  }
}

// Siguiente número de orden libre a partir del original (ORD-2026-0009 ->
// ORD-2026-0010...). El contador anual (clave contadorOrdenes-AAAA de la tabla
// Ajuste) se sube hasta ese número para que no se vuelva a emitir.
async function siguienteNumeroOrden(tx, numeroOriginal) {
  const nuevo = await siguienteTextoLibre(
    numeroOriginal,
    async (n) => (await tx.ordenReparacion.findUnique({ where: { numeroOrden: n } })) !== null,
  )
  const [, anio, numero] = String(nuevo).split('-')
  const n = Number(numero)
  if (anio && Number.isInteger(n)) {
    const clave = `contadorOrdenes-${anio}`
    const contador = await tx.ajuste.findUnique({ where: { clave } })
    const guardado = contador ? Number(contador.valor) : 0
    if (!Number.isInteger(guardado) || guardado < n) {
      await tx.ajuste.upsert({ where: { clave }, update: { valor: String(n) }, create: { clave, valor: String(n) } })
    }
  }
  return nuevo
}

// Orden con sus líneas de materiales y de mano de obra.
async function restaurarOrden(tx, { orden: ordenOriginal, materiales = [], manoObra = [] }, avisos = []) {
  const orden = { ...ordenOriginal }
  // Una orden archivada con un estado antiguo (Presupuesto/Pendiente) se restaura
  // ya con el valor nuevo equivalente.
  orden.estado = normalizarEstado(orden.estado)
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
  // Si su número de orden ya lo usa otra (p. ej. tras volver a una copia de seguridad), vuelve con el siguiente libre.
  if (await tx.ordenReparacion.findUnique({ where: { numeroOrden: orden.numeroOrden } })) {
    const nuevo = await siguienteNumeroOrden(tx, orden.numeroOrden)
    avisos.push(`El nº de orden ${orden.numeroOrden} ya lo usa otra orden: se ha restaurado como ${nuevo}.`)
    orden.numeroOrden = nuevo
  }
  if (!(await idLibre(tx.ordenReparacion, orden.id))) delete orden.id
  const creada = await tx.ordenReparacion.create({ data: orden })
  for (const material of materiales) {
    const datos = { ...(await prepararMaterial(tx, material)), ordenId: creada.id }
    if (!(await idLibre(tx.ordenMaterial, datos.id))) delete datos.id
    await tx.ordenMaterial.create({ data: datos })
  }
  for (const linea of manoObra) {
    const datos = { ...linea, ordenId: creada.id }
    if (!(await idLibre(tx.ordenManoObra, datos.id))) delete datos.id
    await tx.ordenManoObra.create({ data: datos })
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
  const datos = await prepararMaterial(tx, linea)
  if (!(await idLibre(tx.ordenMaterial, datos.id))) delete datos.id
  await tx.ordenMaterial.create({ data: datos })
  await recalcularTotalesOrden(tx, linea.ordenId)
}

async function restaurarLineaManoObra(tx, { linea }) {
  const orden = await tx.ordenReparacion.findUnique({ where: { id: linea.ordenId } })
  if (!orden) throw new ErrorPapelera('No se puede restaurar la línea porque su orden ya no existe.')
  const datos = { ...linea }
  if (!(await idLibre(tx.ordenManoObra, datos.id))) delete datos.id
  await tx.ordenManoObra.create({ data: datos })
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

async function restaurarOperacion(tx, { operacion }, avisos = []) {
  const datos = { ...operacion }
  const codigo = await siguienteTextoLibre(
    datos.codigo,
    async (c) => (await tx.operacionManoObra.findUnique({ where: { codigo: c } })) !== null,
  )
  if (codigo !== datos.codigo) {
    avisos.push(`El código ${datos.codigo} ya lo usa otra operación: se ha restaurado como ${codigo}.`)
    datos.codigo = codigo
  }
  if (!(await idLibre(tx.operacionManoObra, datos.id))) delete datos.id
  await tx.operacionManoObra.create({ data: datos })
}

async function restaurarMecanico(tx, { mecanico }, avisos = []) {
  const datos = { ...mecanico }
  const nombre = await siguienteTextoLibre(
    datos.nombre,
    async (n) => (await tx.mecanico.findUnique({ where: { nombre: n } })) !== null,
    (b, n) => `${b} (${n})`,
  )
  if (nombre !== datos.nombre) {
    avisos.push(`El nombre «${datos.nombre}» ya lo usa otro mecánico: se ha restaurado como «${nombre}».`)
    datos.nombre = nombre
  }
  if (!(await idLibre(tx.mecanico, datos.id))) delete datos.id
  await tx.mecanico.create({ data: datos })
}

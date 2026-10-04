import { Router } from 'express'
import prisma from '../db.js'
import { authMiddleware } from './auth.js'
import { precioSinIva } from '../lib/precios.js'
import { FORMAS_PAGO } from '../lib/pagos.js'
import { coincideTexto } from '../lib/texto.js'
import { guardarEnPapelera, descripcionOrden, descripcionLineaMaterial, descripcionLineaManoObra } from '../lib/papelera.js'

const router = Router()

// Todas las rutas de órdenes requieren autenticación
router.use(authMiddleware)

// Estados permitidos para una orden de reparación
export const ESTADOS_ORDEN = [
  'Presupuesto',
  'Pendiente',
  'EnReparacion',
  'EsperandoMaterial',
  'Finalizada',
  'Entregada',
]

// Tipos de reparación permitidos para una orden
const TIPOS_REPARACION = ['Preferente', 'Programada', 'Urgente', 'NoProgramada']

// Campos de texto opcionales que acepta el modelo OrdenReparacion
const CAMPOS_TEXTO_OPCIONALES = ['problema', 'descripcion', 'diagnostico', 'recomendaciones', 'observaciones', 'seguimiento', 'accesorios']

// Tipo de IVA aplicado a la mano de obra (el modelo OrdenManoObra no guarda un IVA por línea)
const IVA_MANO_OBRA = 21

// Incluye siempre las relaciones de la orden para devolverla completa
const INCLUDE_ORDEN = {
  cliente: true,
  bicicleta: true,
  mecanico: { select: { id: true, nombre: true } },
  materiales: true,
  manoObra: true,
}

// Convierte un parámetro en un identificador entero positivo o devuelve null
function parseId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

// Recorta los espacios de un texto y convierte la cadena vacía en null
function normalizarTexto(value) {
  if (typeof value !== 'string') return value
  const limpio = value.trim()
  return limpio === '' ? null : limpio
}

// Convierte y valida un número finito (admite negativos); devuelve null si no es válido
function numeroFinito(value) {
  const num = typeof value === 'string' ? value.trim() : value
  if (num === null || num === undefined || num === '' || typeof num === 'boolean' || Array.isArray(num) || typeof num === 'object') {
    return null
  }
  const parsed = Number(num)
  return Number.isFinite(parsed) ? parsed : null
}

// Convierte y valida un número finito mayor o igual que 0; devuelve null si no es válido
function numeroNoNegativo(value) {
  const num = numeroFinito(value)
  return num !== null && num >= 0 ? num : null
}

// Redondea a dos decimales para evitar errores de coma flotante en los importes
export function redondear2(value) {
  // Redondeo decimal exacto: 1007.865 -> 1007.87 (con EPSILON fallaba en importes grandes)
  const escalado = Number(`${Number(value.toFixed(8))}e2`)
  return (Number.isFinite(escalado) ? Math.round(escalado) : Math.round(value * 100)) / 100
}

// Convierte un valor en una fecha válida o devuelve null
function parseFecha(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const fecha = new Date(value)
  return Number.isNaN(fecha.getTime()) ? null : fecha
}

// Genera el siguiente número de orden con formato ORD-YYYY-NNNN para el año actual.
// El número nunca se reutiliza: se guarda por año un contador (clave
// `contadorOrdenes-<AAAA>` en la tabla Ajuste) con el último número emitido, de
// modo que, aunque se borre la última orden, el siguiente número sigue subiendo.
async function generarNumeroOrden(client = prisma) {
  const anio = new Date().getFullYear()
  const prefijo = `ORD-${anio}-`
  const claveContador = `contadorOrdenes-${anio}`

  const ultima = await client.ordenReparacion.findFirst({
    where: { numeroOrden: { startsWith: prefijo } },
    orderBy: { numeroOrden: 'desc' },
  })

  let ultimoEmitido = 0
  if (ultima) {
    const numero = Number(ultima.numeroOrden.split('-')[2])
    if (Number.isInteger(numero) && numero >= 1) {
      ultimoEmitido = numero
    }
  }

  // El contador guardado puede ser mayor que el número más alto existente (por
  // ejemplo, si se borró la última orden), así que se toma el mayor de los dos.
  const contador = await client.ajuste.findUnique({ where: { clave: claveContador } })
  if (contador) {
    const guardado = Number(contador.valor)
    if (Number.isInteger(guardado) && guardado > ultimoEmitido) {
      ultimoEmitido = guardado
    }
  }

  let siguiente = ultimoEmitido + 1

  // Evita colisiones si el número calculado ya existe
  let numeroOrden
  do {
    numeroOrden = `${prefijo}${String(siguiente).padStart(4, '0')}`
    const existe = await client.ordenReparacion.findUnique({ where: { numeroOrden } })
    if (!existe) break
    siguiente += 1
  } while (true)

  // Persiste el contador con el mismo cliente para que, dentro de una transacción,
  // la reserva del número sea atómica.
  await client.ajuste.upsert({
    where: { clave: claveContador },
    update: { valor: String(siguiente) },
    create: { clave: claveContador, valor: String(siguiente) },
  })

  return numeroOrden
}

// Valida y construye los datos de una orden a partir del cuerpo de la petición.
// Con `parcial: true` solo se tienen en cuenta los campos presentes (actualización).
function construirDatosOrden(body, { parcial = false } = {}) {
  const datos = {}

  if (body.clienteId !== undefined || !parcial) {
    const clienteId = parseId(body.clienteId)
    if (clienteId === null) {
      return { error: 'El cliente es obligatorio y debe ser un identificador válido' }
    }
    datos.clienteId = clienteId
  }

  if (body.bicicletaId !== undefined) {
    if (body.bicicletaId === null || body.bicicletaId === '') {
      datos.bicicletaId = null
    } else {
      const bicicletaId = parseId(body.bicicletaId)
      if (bicicletaId === null) {
        return { error: 'El identificador de bicicleta no es válido' }
      }
      datos.bicicletaId = bicicletaId
    }
  }

  if (body.mecanicoId !== undefined) {
    if (body.mecanicoId === null || body.mecanicoId === '') {
      datos.mecanicoId = null
    } else {
      const mecanicoId = parseId(body.mecanicoId)
      if (mecanicoId === null) {
        return { error: 'El identificador de mecánico no es válido' }
      }
      datos.mecanicoId = mecanicoId
    }
  }

  if (body.fechaEntrada !== undefined) {
    const fechaEntrada = parseFecha(body.fechaEntrada)
    if (fechaEntrada === null) {
      return { error: 'La fecha de entrada no es una fecha válida' }
    }
    datos.fechaEntrada = fechaEntrada
  }

  if (body.fechaPrevista !== undefined) {
    if (body.fechaPrevista === null || body.fechaPrevista === '') {
      datos.fechaPrevista = null
    } else {
      const fechaPrevista = parseFecha(body.fechaPrevista)
      if (fechaPrevista === null) {
        return { error: 'La fecha prevista no es una fecha válida' }
      }
      datos.fechaPrevista = fechaPrevista
    }
  }

  if (body.estado !== undefined) {
    if (typeof body.estado !== 'string' || !ESTADOS_ORDEN.includes(body.estado)) {
      return { error: `Estado no válido. Valores permitidos: ${ESTADOS_ORDEN.join(', ')}` }
    }
    datos.estado = body.estado
  }

  if (body.descuentoGlobal !== undefined) {
    const descuentoGlobal = numeroNoNegativo(body.descuentoGlobal)
    if (descuentoGlobal === null || descuentoGlobal > 100) {
      return { error: 'El descuento global debe ser un número entre 0 y 100' }
    }
    datos.descuentoGlobal = descuentoGlobal
  }

  for (const campo of CAMPOS_TEXTO_OPCIONALES) {
    if (body[campo] !== undefined) {
      if (body[campo] !== null && typeof body[campo] !== 'string') {
        return { error: `El campo ${campo} debe ser una cadena de texto` }
      }
      datos[campo] = normalizarTexto(body[campo])
    }
  }

  if (body.garantia !== undefined) {
    if (typeof body.garantia !== 'boolean') {
      return { error: 'El campo garantia debe ser un valor booleano' }
    }
    datos.garantia = body.garantia
  }

  if (body.clienteAvisado !== undefined) {
    if (typeof body.clienteAvisado !== 'boolean') {
      return { error: 'El campo clienteAvisado debe ser un valor booleano' }
    }
    datos.clienteAvisado = body.clienteAvisado
  }

  if (body.tipoReparacion !== undefined) {
    if (body.tipoReparacion === null || body.tipoReparacion === '') {
      datos.tipoReparacion = null
    } else if (typeof body.tipoReparacion !== 'string' || !TIPOS_REPARACION.includes(body.tipoReparacion)) {
      return { error: `Tipo de reparación no válido. Valores permitidos: ${TIPOS_REPARACION.join(', ')}` }
    } else {
      datos.tipoReparacion = body.tipoReparacion
    }
  }

  if (body.formaPago !== undefined) {
    if (body.formaPago === null || body.formaPago === '') {
      datos.formaPago = null
    } else if (typeof body.formaPago !== 'string' || !FORMAS_PAGO.includes(body.formaPago)) {
      return { error: `Forma de pago no válida. Valores permitidos: ${FORMAS_PAGO.join(', ')}` }
    } else {
      datos.formaPago = body.formaPago
    }
  } else if (!parcial) {
    // Una orden nueva se crea siempre con una forma de pago: Pendiente por defecto.
    datos.formaPago = 'Pendiente'
  }

  // El antiguo campo estadoPago se ignora si llega en el cuerpo: su valor se
  // unificó en formaPago y ya no se valida ni se guarda.

  return { datos }
}

// Valida y construye los datos de una línea de material, calculando sus importes
function construirDatosMaterial(body, articulo = null) {
  const datos = {}

  const referencia = body.referencia === undefined && articulo ? articulo.referencia : body.referencia
  if (typeof referencia !== 'string' || !referencia.trim()) {
    return { error: 'La referencia del material es obligatoria y debe ser una cadena de texto' }
  }
  datos.referencia = referencia.trim()

  const descripcion = body.descripcion === undefined && articulo ? articulo.descripcion : body.descripcion
  if (typeof descripcion !== 'string' || !descripcion.trim()) {
    return { error: 'La descripción del material es obligatoria y debe ser una cadena de texto' }
  }
  datos.descripcion = descripcion.trim()

  if (body.articuloId !== undefined && body.articuloId !== null) {
    const articuloId = parseId(body.articuloId)
    if (articuloId === null) {
      return { error: 'El identificador de artículo no es válido' }
    }
    datos.articuloId = articuloId
  }

  const cantidad = body.cantidad === undefined ? 1 : numeroFinito(body.cantidad)
  if (cantidad === null || cantidad <= 0) {
    return { error: 'La cantidad debe ser un número mayor que 0' }
  }
  datos.cantidad = cantidad

  // El precio de venta del catálogo lleva el IVA incluido, pero las líneas de
  // orden trabajan con el precio SIN IVA (luego se le suma el IVA de la línea).
  const precioUnitario = body.precioUnitario === undefined
    ? (articulo ? precioSinIva(articulo.precioVenta, articulo.iva) : 0)
    : numeroNoNegativo(body.precioUnitario)
  if (precioUnitario === null) {
    return { error: 'El precio unitario debe ser un número válido mayor o igual que 0' }
  }
  datos.precioUnitario = precioUnitario

  const descuento = body.descuento === undefined ? 0 : numeroNoNegativo(body.descuento)
  if (descuento === null || descuento > 100) {
    return { error: 'El descuento del material debe ser un número entre 0 y 100' }
  }
  datos.descuento = descuento

  const iva = body.iva === undefined ? (articulo ? articulo.iva : 21) : numeroNoNegativo(body.iva)
  if (iva === null) {
    return { error: 'El IVA del material debe ser un número válido mayor o igual que 0' }
  }
  datos.iva = iva

  datos.precioNeto = redondear2(cantidad * precioUnitario * (1 - descuento / 100))
  datos.importeTotal = redondear2(datos.precioNeto * (1 + iva / 100))

  return { datos }
}

// Valida y construye los datos de una línea de mano de obra, calculando su importe
function construirDatosManoObra(body) {
  const datos = {}

  if (typeof body.codigoOp !== 'string' || !body.codigoOp.trim()) {
    return { error: 'El código de operación es obligatorio y debe ser una cadena de texto' }
  }
  datos.codigoOp = body.codigoOp.trim()

  if (typeof body.descripcion !== 'string' || !body.descripcion.trim()) {
    return { error: 'La descripción de la mano de obra es obligatoria y debe ser una cadena de texto' }
  }
  datos.descripcion = body.descripcion.trim()

  const tiempo = body.tiempo === undefined ? 0 : numeroNoNegativo(body.tiempo)
  if (tiempo === null) {
    return { error: 'El tiempo debe ser un número válido mayor o igual que 0' }
  }
  datos.tiempo = tiempo

  const precioHora = body.precioHora === undefined ? 0 : numeroNoNegativo(body.precioHora)
  if (precioHora === null) {
    return { error: 'El precio por hora debe ser un número válido mayor o igual que 0' }
  }
  datos.precioHora = precioHora

  datos.importe = redondear2(tiempo * precioHora)

  return { datos }
}

// Calcula los totales de la orden a partir de sus líneas y del descuento global
export function calcularTotales(materiales, manoObra, descuentoGlobal) {
  let subtotalMateriales = 0
  let ivaMateriales = 0
  for (const material of materiales) {
    subtotalMateriales += material.precioNeto
    ivaMateriales += material.precioNeto * (material.iva / 100)
  }
  const subtotalManoObra = manoObra.reduce((total, linea) => total + linea.importe, 0)

  const factor = 1 - descuentoGlobal / 100
  const baseImponible = redondear2((subtotalMateriales + subtotalManoObra) * factor)
  const iva = redondear2((ivaMateriales + subtotalManoObra * (IVA_MANO_OBRA / 100)) * factor)
  const total = redondear2(baseImponible + iva)

  return {
    subtotalMateriales: redondear2(subtotalMateriales),
    subtotalManoObra: redondear2(subtotalManoObra),
    descuentoGlobal,
    baseImponible,
    iva,
    total,
  }
}

// Recalcula y persiste los totales de una orden a partir de sus líneas actuales
async function recalcularOrden(ordenId) {
  const orden = await prisma.ordenReparacion.findUnique({
    where: { id: ordenId },
    include: { materiales: true, manoObra: true },
  })
  const totales = calcularTotales(orden.materiales, orden.manoObra, orden.descuentoGlobal)
  return prisma.ordenReparacion.update({
    where: { id: ordenId },
    data: totales,
    include: INCLUDE_ORDEN,
  })
}

// Comprueba que una bicicleta existe y pertenece al cliente indicado.
// Devuelve un mensaje de error o null si todo es correcto.
async function validarBicicleta(bicicletaId, clienteId) {
  if (bicicletaId === null || bicicletaId === undefined) return null
  const bicicleta = await prisma.bicicleta.findUnique({ where: { id: bicicletaId } })
  if (!bicicleta) return 'La bicicleta indicada no existe'
  if (bicicleta.clienteId !== clienteId) return 'La bicicleta indicada no pertenece al cliente'
  return null
}

// Comprueba que el mecánico indicado existe y está activo.
// Devuelve un mensaje de error o null si todo es correcto.
async function validarMecanico(mecanicoId) {
  if (mecanicoId === null || mecanicoId === undefined) return null
  const mecanico = await prisma.mecanico.findUnique({ where: { id: mecanicoId } })
  if (!mecanico) return 'El mecánico indicado no existe'
  if (!mecanico.activo) return 'El mecánico indicado no está activo'
  return null
}

// GET / -> lista de órdenes (opcionalmente filtradas por ?clienteId=, ?estado=,
// ?mecanicoId=, ?tipoReparacion=, ?formaPago= y búsqueda ?q=)
router.get('/', async (req, res, next) => {
  try {
    const where = {}
    if (req.query.clienteId !== undefined) {
      const clienteId = parseId(req.query.clienteId)
      if (clienteId === null) {
        return res.status(400).json({ error: 'El filtro clienteId no es válido' })
      }
      where.clienteId = clienteId
    }
    if (req.query.mecanicoId !== undefined) {
      const mecanicoId = parseId(req.query.mecanicoId)
      if (mecanicoId === null) {
        return res.status(400).json({ error: 'El filtro mecanicoId no es válido' })
      }
      where.mecanicoId = mecanicoId
    }
    if (req.query.estado !== undefined) {
      if (typeof req.query.estado !== 'string' || !ESTADOS_ORDEN.includes(req.query.estado)) {
        return res.status(400).json({ error: `El filtro estado no es válido. Valores permitidos: ${ESTADOS_ORDEN.join(', ')}` })
      }
      where.estado = req.query.estado
    }
    if (req.query.tipoReparacion !== undefined) {
      if (typeof req.query.tipoReparacion !== 'string' || !TIPOS_REPARACION.includes(req.query.tipoReparacion)) {
        return res.status(400).json({ error: `El filtro tipoReparacion no es válido. Valores permitidos: ${TIPOS_REPARACION.join(', ')}` })
      }
      where.tipoReparacion = req.query.tipoReparacion
    }
    if (req.query.formaPago !== undefined) {
      if (typeof req.query.formaPago !== 'string' || !FORMAS_PAGO.includes(req.query.formaPago)) {
        return res.status(400).json({ error: `El filtro formaPago no es válido. Valores permitidos: ${FORMAS_PAGO.join(', ')}` })
      }
      where.formaPago = req.query.formaPago
    }
    const q = req.query.q !== undefined ? String(req.query.q).trim() : ''

    const ordenes = await prisma.ordenReparacion.findMany({
      where,
      orderBy: { id: 'desc' },
      include: INCLUDE_ORDEN,
    })

    // Búsqueda por ?q= en nº de orden, cliente o bicicleta, ignorando mayúsculas
    // y acentos (se resuelve en memoria, porque SQLite no ignora los diacríticos).
    if (q === '') return res.json(ordenes)

    const filtradas = ordenes.filter((orden) => coincideTexto([
      orden.numeroOrden,
      orden.cliente?.nombre,
      orden.cliente?.apellidos,
      orden.bicicleta?.marca,
      orden.bicicleta?.modelo,
      orden.bicicleta?.numeroSerie,
    ], q))

    return res.json(filtradas)
  } catch (error) {
    return next(error)
  }
})

// GET /:id -> orden concreta con cliente, bicicleta, materiales y mano de obra
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(400).json({ error: 'Identificador de orden no válido' })
    }

    const orden = await prisma.ordenReparacion.findUnique({
      where: { id },
      include: INCLUDE_ORDEN,
    })
    if (!orden) {
      return res.status(404).json({ error: 'Orden no encontrada' })
    }

    return res.json(orden)
  } catch (error) {
    return next(error)
  }
})

// POST / -> crear orden (generando el número de orden y validando cliente/bicicleta)
router.post('/', async (req, res, next) => {
  try {
    const body = req.body ?? {}

    const { datos, error } = construirDatosOrden(body)
    if (error) {
      return res.status(400).json({ error })
    }

    const cliente = await prisma.cliente.findUnique({ where: { id: datos.clienteId } })
    if (!cliente) {
      return res.status(404).json({ error: 'El cliente indicado no existe' })
    }

    const errorBicicleta = await validarBicicleta(datos.bicicletaId, datos.clienteId)
    if (errorBicicleta) {
      return res.status(400).json({ error: errorBicicleta })
    }

    const errorMecanico = await validarMecanico(datos.mecanicoId)
    if (errorMecanico) {
      return res.status(400).json({ error: errorMecanico })
    }

    // Líneas iniciales opcionales (materiales y mano de obra)
    const materialesData = []
    if (body.materiales !== undefined) {
      if (!Array.isArray(body.materiales)) {
        return res.status(400).json({ error: 'El campo materiales debe ser una lista' })
      }
      for (const item of body.materiales) {
        const { datos: linea, error: errorLinea } = construirDatosMaterial(item ?? {})
        if (errorLinea) {
          return res.status(400).json({ error: errorLinea })
        }
        if (linea.articuloId !== undefined) {
          const articulo = await prisma.articulo.findUnique({ where: { id: linea.articuloId } })
          if (!articulo) {
            return res.status(404).json({ error: 'El artículo indicado no existe' })
          }
        }
        materialesData.push(linea)
      }
    }

    const manoObraData = []
    if (body.manoObra !== undefined) {
      if (!Array.isArray(body.manoObra)) {
        return res.status(400).json({ error: 'El campo manoObra debe ser una lista' })
      }
      for (const item of body.manoObra) {
        const { datos: linea, error: errorLinea } = construirDatosManoObra(item ?? {})
        if (errorLinea) {
          return res.status(400).json({ error: errorLinea })
        }
        manoObraData.push(linea)
      }
    }

    const descuentoGlobal = datos.descuentoGlobal ?? 0
    const totales = calcularTotales(materialesData, manoObraData, descuentoGlobal)
    const numeroOrden = await generarNumeroOrden()

    const orden = await prisma.ordenReparacion.create({
      data: {
        ...datos,
        numeroOrden,
        ...totales,
        materiales: materialesData.length ? { create: materialesData } : undefined,
        manoObra: manoObraData.length ? { create: manoObraData } : undefined,
      },
      include: INCLUDE_ORDEN,
    })

    return res.status(201).json(orden)
  } catch (error) {
    return next(error)
  }
})

// PUT /:id -> actualizar orden y recalcular totales
router.put('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(400).json({ error: 'Identificador de orden no válido' })
    }

    const existente = await prisma.ordenReparacion.findUnique({ where: { id } })
    if (!existente) {
      return res.status(404).json({ error: 'Orden no encontrada' })
    }

    const { datos, error } = construirDatosOrden(req.body ?? {}, { parcial: true })
    if (error) {
      return res.status(400).json({ error })
    }
    if (Object.keys(datos).length === 0) {
      return res.status(400).json({ error: 'No se han proporcionado campos para actualizar' })
    }

    const clienteIdFinal = datos.clienteId !== undefined ? datos.clienteId : existente.clienteId
    if (datos.clienteId !== undefined) {
      const cliente = await prisma.cliente.findUnique({ where: { id: datos.clienteId } })
      if (!cliente) {
        return res.status(404).json({ error: 'El cliente indicado no existe' })
      }
    }

    const bicicletaIdFinal = datos.bicicletaId !== undefined ? datos.bicicletaId : existente.bicicletaId
    const errorBicicleta = await validarBicicleta(bicicletaIdFinal, clienteIdFinal)
    if (errorBicicleta) {
      return res.status(400).json({ error: errorBicicleta })
    }

    const errorMecanico = await validarMecanico(datos.mecanicoId)
    if (errorMecanico) {
      return res.status(400).json({ error: errorMecanico })
    }

    await prisma.ordenReparacion.update({ where: { id }, data: datos })
    const orden = await recalcularOrden(id)
    return res.json(orden)
  } catch (error) {
    return next(error)
  }
})

// DELETE /:id -> eliminar orden (y en cascada sus materiales y mano de obra)
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(400).json({ error: 'Identificador de orden no válido' })
    }

    const existente = await prisma.ordenReparacion.findUnique({
      where: { id },
      include: { materiales: true, manoObra: true },
    })
    if (!existente) {
      return res.status(404).json({ error: 'Orden no encontrada' })
    }

    const { materiales, manoObra, ...orden } = existente
    const usuario = req.user?.nombre ?? req.user?.username ?? null
    const { id: papeleraId } = await prisma.$transaction(async (tx) => {
      const creada = await guardarEnPapelera(tx, {
        tipo: 'orden',
        descripcion: descripcionOrden(existente),
        datos: { orden, materiales, manoObra },
        usuario,
      })
      await tx.ordenReparacion.delete({ where: { id } })
      return creada
    })
    return res.json({ success: true, papeleraId })
  } catch (error) {
    return next(error)
  }
})

// POST /:id/materiales -> añadir una línea de material a la orden
router.post('/:id/materiales', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(400).json({ error: 'Identificador de orden no válido' })
    }

    const orden = await prisma.ordenReparacion.findUnique({ where: { id } })
    if (!orden) {
      return res.status(404).json({ error: 'Orden no encontrada' })
    }

    const body = req.body ?? {}
    let articulo = null
    if (body.articuloId !== undefined && body.articuloId !== null) {
      const articuloId = parseId(body.articuloId)
      if (articuloId === null) {
        return res.status(400).json({ error: 'El identificador de artículo no es válido' })
      }
      articulo = await prisma.articulo.findUnique({ where: { id: articuloId } })
      if (!articulo) {
        return res.status(404).json({ error: 'El artículo indicado no existe' })
      }
    }

    const { datos, error } = construirDatosMaterial(body, articulo)
    if (error) {
      return res.status(400).json({ error })
    }

    await prisma.ordenMaterial.create({ data: { ...datos, ordenId: id } })
    const resultado = await recalcularOrden(id)
    return res.status(201).json(resultado)
  } catch (error) {
    return next(error)
  }
})

// DELETE /:id/materiales/:materialId -> eliminar una línea de material de la orden
router.delete('/:id/materiales/:materialId', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(400).json({ error: 'Identificador de orden no válido' })
    }
    const materialId = parseId(req.params.materialId)
    if (materialId === null) {
      return res.status(400).json({ error: 'Identificador de material no válido' })
    }

    const orden = await prisma.ordenReparacion.findUnique({ where: { id } })
    if (!orden) {
      return res.status(404).json({ error: 'Orden no encontrada' })
    }

    const material = await prisma.ordenMaterial.findUnique({ where: { id: materialId } })
    if (!material || material.ordenId !== id) {
      return res.status(404).json({ error: 'Material no encontrado en la orden' })
    }

    const usuario = req.user?.nombre ?? req.user?.username ?? null
    const { id: papeleraId } = await prisma.$transaction(async (tx) => {
      const creada = await guardarEnPapelera(tx, {
        tipo: 'material-orden',
        descripcion: descripcionLineaMaterial(material, orden.numeroOrden),
        datos: { linea: material },
        usuario,
      })
      await tx.ordenMaterial.delete({ where: { id: materialId } })
      return creada
    })
    const resultado = await recalcularOrden(id)
    return res.json({ ...resultado, papeleraId })
  } catch (error) {
    return next(error)
  }
})

// PUT /:id/materiales/:materialId -> editar una línea de material de la orden
router.put('/:id/materiales/:materialId', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(400).json({ error: 'Identificador de orden no válido' })
    }
    const materialId = parseId(req.params.materialId)
    if (materialId === null) {
      return res.status(400).json({ error: 'Identificador de material no válido' })
    }

    const orden = await prisma.ordenReparacion.findUnique({ where: { id } })
    if (!orden) {
      return res.status(404).json({ error: 'Orden no encontrada' })
    }

    const material = await prisma.ordenMaterial.findUnique({ where: { id: materialId } })
    if (!material || material.ordenId !== id) {
      return res.status(404).json({ error: 'Material no encontrado en la orden' })
    }

    const body = req.body ?? {}
    const camposEditables = ['referencia', 'descripcion', 'cantidad', 'precioUnitario', 'descuento', 'iva']
    if (!camposEditables.some((campo) => body[campo] !== undefined)) {
      return res.status(400).json({ error: 'No se han proporcionado campos para actualizar' })
    }

    // Fusiona los campos presentes con los actuales y recalcula la línea como en el alta
    const { datos, error } = construirDatosMaterial({
      referencia: body.referencia !== undefined ? body.referencia : material.referencia,
      descripcion: body.descripcion !== undefined ? body.descripcion : material.descripcion,
      cantidad: body.cantidad !== undefined ? body.cantidad : material.cantidad,
      precioUnitario: body.precioUnitario !== undefined ? body.precioUnitario : material.precioUnitario,
      descuento: body.descuento !== undefined ? body.descuento : material.descuento,
      iva: body.iva !== undefined ? body.iva : material.iva,
    })
    if (error) {
      return res.status(400).json({ error })
    }

    await prisma.ordenMaterial.update({ where: { id: materialId }, data: datos })
    const resultado = await recalcularOrden(id)
    return res.json(resultado)
  } catch (error) {
    return next(error)
  }
})

// POST /:id/mano-obra -> añadir una línea de mano de obra a la orden
router.post('/:id/mano-obra', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(400).json({ error: 'Identificador de orden no válido' })
    }

    const orden = await prisma.ordenReparacion.findUnique({ where: { id } })
    if (!orden) {
      return res.status(404).json({ error: 'Orden no encontrada' })
    }

    const { datos, error } = construirDatosManoObra(req.body ?? {})
    if (error) {
      return res.status(400).json({ error })
    }

    await prisma.ordenManoObra.create({ data: { ...datos, ordenId: id } })
    const resultado = await recalcularOrden(id)
    return res.status(201).json(resultado)
  } catch (error) {
    return next(error)
  }
})

// DELETE /:id/mano-obra/:manoObraId -> eliminar una línea de mano de obra de la orden
router.delete('/:id/mano-obra/:manoObraId', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(400).json({ error: 'Identificador de orden no válido' })
    }
    const manoObraId = parseId(req.params.manoObraId)
    if (manoObraId === null) {
      return res.status(400).json({ error: 'Identificador de mano de obra no válido' })
    }

    const orden = await prisma.ordenReparacion.findUnique({ where: { id } })
    if (!orden) {
      return res.status(404).json({ error: 'Orden no encontrada' })
    }

    const linea = await prisma.ordenManoObra.findUnique({ where: { id: manoObraId } })
    if (!linea || linea.ordenId !== id) {
      return res.status(404).json({ error: 'Mano de obra no encontrada en la orden' })
    }

    const usuario = req.user?.nombre ?? req.user?.username ?? null
    const { id: papeleraId } = await prisma.$transaction(async (tx) => {
      const creada = await guardarEnPapelera(tx, {
        tipo: 'mano-obra-orden',
        descripcion: descripcionLineaManoObra(linea, orden.numeroOrden),
        datos: { linea },
        usuario,
      })
      await tx.ordenManoObra.delete({ where: { id: manoObraId } })
      return creada
    })
    const resultado = await recalcularOrden(id)
    return res.json({ ...resultado, papeleraId })
  } catch (error) {
    return next(error)
  }
})

// PUT /:id/mano-obra/:manoObraId -> editar una línea de mano de obra de la orden
router.put('/:id/mano-obra/:manoObraId', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(400).json({ error: 'Identificador de orden no válido' })
    }
    const manoObraId = parseId(req.params.manoObraId)
    if (manoObraId === null) {
      return res.status(400).json({ error: 'Identificador de mano de obra no válido' })
    }

    const orden = await prisma.ordenReparacion.findUnique({ where: { id } })
    if (!orden) {
      return res.status(404).json({ error: 'Orden no encontrada' })
    }

    const linea = await prisma.ordenManoObra.findUnique({ where: { id: manoObraId } })
    if (!linea || linea.ordenId !== id) {
      return res.status(404).json({ error: 'Mano de obra no encontrada en la orden' })
    }

    const body = req.body ?? {}
    const camposEditables = ['codigoOp', 'descripcion', 'tiempo', 'precioHora']
    if (!camposEditables.some((campo) => body[campo] !== undefined)) {
      return res.status(400).json({ error: 'No se han proporcionado campos para actualizar' })
    }

    // Fusiona los campos presentes con los actuales y recalcula la línea como en el alta
    const { datos, error } = construirDatosManoObra({
      codigoOp: body.codigoOp !== undefined ? body.codigoOp : linea.codigoOp,
      descripcion: body.descripcion !== undefined ? body.descripcion : linea.descripcion,
      tiempo: body.tiempo !== undefined ? body.tiempo : linea.tiempo,
      precioHora: body.precioHora !== undefined ? body.precioHora : linea.precioHora,
    })
    if (error) {
      return res.status(400).json({ error })
    }

    await prisma.ordenManoObra.update({ where: { id: manoObraId }, data: datos })
    const resultado = await recalcularOrden(id)
    return res.json(resultado)
  } catch (error) {
    return next(error)
  }
})

// POST /:id/duplicar -> crea una orden nueva en Presupuesto copiando la orden actual
router.post('/:id/duplicar', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(400).json({ error: 'Identificador de orden no válido' })
    }

    const original = await prisma.ordenReparacion.findUnique({
      where: { id },
      include: { materiales: true, manoObra: true },
    })
    if (!original) {
      return res.status(404).json({ error: 'Orden no encontrada' })
    }

    const materialesData = original.materiales.map((linea) => ({
      articuloId: linea.articuloId,
      referencia: linea.referencia,
      descripcion: linea.descripcion,
      cantidad: linea.cantidad,
      precioUnitario: linea.precioUnitario,
      descuento: linea.descuento,
      precioNeto: linea.precioNeto,
      iva: linea.iva,
      importeTotal: linea.importeTotal,
    }))
    const manoObraData = original.manoObra.map((linea) => ({
      codigoOp: linea.codigoOp,
      descripcion: linea.descripcion,
      tiempo: linea.tiempo,
      precioHora: linea.precioHora,
      importe: linea.importe,
    }))

    const duplicada = await prisma.$transaction(async (tx) => {
      const numeroOrden = await generarNumeroOrden(tx)
      const totales = calcularTotales(materialesData, manoObraData, original.descuentoGlobal)
      return tx.ordenReparacion.create({
        data: {
          numeroOrden,
          clienteId: original.clienteId,
          bicicletaId: original.bicicletaId,
          estado: 'Presupuesto',
          descripcion: original.descripcion,
          diagnostico: original.diagnostico,
          recomendaciones: original.recomendaciones,
          problema: original.problema,
          garantia: original.garantia,
          tipoReparacion: original.tipoReparacion,
          // La copia es una orden nueva (en Presupuesto): empieza sin cobrar.
          formaPago: 'Pendiente',
          mecanicoId: original.mecanicoId,
          descuentoGlobal: original.descuentoGlobal,
          ...totales,
          materiales: materialesData.length ? { create: materialesData } : undefined,
          manoObra: manoObraData.length ? { create: manoObraData } : undefined,
        },
        include: INCLUDE_ORDEN,
      })
    })

    return res.status(201).json(duplicada)
  } catch (error) {
    return next(error)
  }
})

export default router

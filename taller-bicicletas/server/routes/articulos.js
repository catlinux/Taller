import { Router } from 'express'
import prisma from '../db.js'
import { authMiddleware, roleMiddleware } from './auth.js'
import { precioSinIva } from '../lib/precios.js'
import { sinStockDesdeNuevo } from '../lib/stock.js'
import { filtrarObsoletos } from '../lib/obsoletos.js'
import { agruparConsumo, resolverEstados, AGRUPACIONES, rangoDeFechas, parseFechaISO } from '../lib/consumo.js'
import { serieConsumo, AGRUPACIONES_SERIE, PERIODOS_POR_DEFECTO } from '../lib/consumoSerie.js'
import { coincideTexto } from '../lib/texto.js'
import { guardarEnPapelera, descripcionArticulo } from '../lib/papelera.js'

const router = Router()

// Todas las rutas de artículos requieren autenticación
router.use(authMiddleware)

// Valores de IVA permitidos para un artículo
export const IVAS_PERMITIDOS = [0, 4, 10, 21]

// Campos de texto opcionales que acepta el modelo Articulo
const CAMPOS_TEXTO_OPCIONALES = ['familia', 'proveedor']

// Convierte un parámetro en un identificador entero positivo o devuelve null
function parseId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

// Añade el precio de venta SIN IVA (campo calculado, no se guarda en la base):
// el precio de venta del catálogo ya lleva el IVA incluido.
function conPrecioSinIva(articulo) {
  if (!articulo) return articulo
  return { ...articulo, precioVentaSinIva: precioSinIva(articulo.precioVenta, articulo.iva) }
}

// Recorta los espacios de un texto y convierte la cadena vacía en null
function normalizarTexto(value) {
  if (typeof value !== 'string') return value
  const limpio = value.trim()
  return limpio === '' ? null : limpio
}

// Lee un parámetro de consulta como texto recortado; null si falta, está vacío
// o llega repetido (array).
function textoDeQuery(value) {
  if (value === undefined || value === null || Array.isArray(value)) return null
  const limpio = String(value).trim()
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

// Lee un parámetro de consulta como entero >= 0; devuelve null si no es válido
function enteroNoNegativoDeQuery(value) {
  const texto = String(value).trim()
  return /^\d+$/.test(texto) ? Number(texto) : null
}

// Valida y construye los datos de un artículo a partir del cuerpo de la petición.
// Con `parcial: true` solo se tienen en cuenta los campos presentes (actualización).
function construirDatosArticulo(body, { parcial = false } = {}) {
  const datos = {}

  if (body.referencia !== undefined || !parcial) {
    if (typeof body.referencia !== 'string' || !body.referencia.trim()) {
      return { error: 'La referencia es obligatoria y debe ser una cadena de texto' }
    }
    datos.referencia = body.referencia.trim()
  }

  if (body.descripcion !== undefined || !parcial) {
    if (typeof body.descripcion !== 'string' || !body.descripcion.trim()) {
      return { error: 'La descripción es obligatoria y debe ser una cadena de texto' }
    }
    datos.descripcion = body.descripcion.trim()
  }

  if (body.precioCompra !== undefined) {
    const precioCompra = numeroNoNegativo(body.precioCompra)
    if (precioCompra === null) {
      return { error: 'El precio de compra debe ser un número válido mayor o igual que 0' }
    }
    datos.precioCompra = precioCompra
  }

  if (body.precioVenta !== undefined) {
    const precioVenta = numeroNoNegativo(body.precioVenta)
    if (precioVenta === null) {
      return { error: 'El precio de venta debe ser un número válido mayor o igual que 0' }
    }
    datos.precioVenta = precioVenta
  }

  if (body.iva !== undefined) {
    const iva = numeroNoNegativo(body.iva)
    if (iva === null || !IVAS_PERMITIDOS.includes(iva)) {
      return { error: `El IVA debe ser uno de los valores permitidos: ${IVAS_PERMITIDOS.join(', ')}` }
    }
    datos.iva = iva
  }

  if (body.stock !== undefined) {
    const stock = numeroNoNegativo(body.stock)
    if (stock === null) {
      return { error: 'El stock debe ser un número válido mayor o igual que 0' }
    }
    datos.stock = stock
  }

  for (const campo of CAMPOS_TEXTO_OPCIONALES) {
    if (body[campo] !== undefined) {
      if (body[campo] !== null && typeof body[campo] !== 'string') {
        return { error: `El campo ${campo} debe ser una cadena de texto` }
      }
      datos[campo] = normalizarTexto(body[campo])
    }
  }

  return { datos }
}

// GET / -> lista de artículos (opcionalmente filtrados por ?familia=)
router.get('/', async (req, res, next) => {
  try {
    const where = {}
    if (req.query.familia !== undefined) {
      where.familia = normalizarTexto(String(req.query.familia))
    }

    const articulos = await prisma.articulo.findMany({
      where,
      orderBy: { id: 'asc' },
    })
    return res.json(articulos.map(conPrecioSinIva))
  } catch (error) {
    return next(error)
  }
})

// GET /obsoletos -> artículos sin stock y/o sin movimientos.
// Debe declararse ANTES de '/:id' para que no lo capture la ruta con parámetro.
router.get('/obsoletos', async (req, res, next) => {
  try {
    const opciones = {}

    if (req.query.sinStockDias !== undefined && req.query.sinStockDias !== '') {
      const sinStockDias = enteroNoNegativoDeQuery(req.query.sinStockDias)
      if (sinStockDias === null) {
        return res.status(400).json({ error: 'sinStockDias debe ser un entero mayor o igual que 0' })
      }
      opciones.sinStockDias = sinStockDias
    }

    if (req.query.sinMovimientosDias !== undefined && req.query.sinMovimientosDias !== '') {
      const sinMovimientosDias = enteroNoNegativoDeQuery(req.query.sinMovimientosDias)
      if (sinMovimientosDias === null) {
        return res.status(400).json({ error: 'sinMovimientosDias debe ser un entero mayor o igual que 0' })
      }
      opciones.sinMovimientosDias = sinMovimientosDias
    }

    // Por defecto se incluyen los artículos que nunca se han usado.
    opciones.incluirNuncaUsados = req.query.incluirNuncaUsados === undefined || req.query.incluirNuncaUsados !== 'false'

    if (req.query.q !== undefined) {
      opciones.q = normalizarTexto(String(req.query.q))
    }
    if (req.query.familia !== undefined) {
      opciones.familia = normalizarTexto(String(req.query.familia))
    }
    if (req.query.limite !== undefined && req.query.limite !== '') {
      const limite = enteroNoNegativoDeQuery(req.query.limite)
      if (limite === null) {
        return res.status(400).json({ error: 'limite debe ser un entero mayor o igual que 0' })
      }
      if (limite > 0) opciones.limite = Math.min(limite, 5000)
    }

    const articulos = await prisma.articulo.findMany({
      select: {
        id: true,
        referencia: true,
        descripcion: true,
        familia: true,
        proveedor: true,
        stock: true,
        sinStockDesde: true,
      },
    })

    // Última fecha de movimiento y número de usos por artículo, sin SQL crudo
    // (para evitar problemas con el formato de fechas de SQLite).
    const movimientos = await prisma.ordenMaterial.findMany({
      where: { articuloId: { not: null } },
      select: { articuloId: true, orden: { select: { fechaEntrada: true } } },
    })

    return res.json(filtrarObsoletos(articulos, movimientos, opciones))
  } catch (error) {
    return next(error)
  }
})

// GET /consumo -> consumo de materiales por artículo en un rango de fechas.
// Debe declararse ANTES de '/:id' para que no lo capture la ruta con parámetro.
router.get('/consumo', async (req, res, next) => {
  try {
    const desdeTexto = textoDeQuery(req.query.desde)
    const hastaTexto = textoDeQuery(req.query.hasta)

    if (desdeTexto !== null && parseFechaISO(desdeTexto) === null) {
      return res.status(400).json({ error: 'desde debe tener el formato AAAA-MM-DD' })
    }
    if (hastaTexto !== null && parseFechaISO(hastaTexto) === null) {
      return res.status(400).json({ error: 'hasta debe tener el formato AAAA-MM-DD' })
    }

    const agrupar = textoDeQuery(req.query.agrupar) ?? 'ninguno'
    if (!AGRUPACIONES.includes(agrupar)) {
      return res.status(400).json({ error: `agrupar debe ser uno de: ${AGRUPACIONES.join(', ')}` })
    }

    // Por defecto se incluyen todos los estados.
    const estados = resolverEstados(req.query.estados)

    const rango = rangoDeFechas(desdeTexto, hastaTexto)
    const where = { orden: { estado: { in: estados } } }
    if (rango.desde !== null || rango.hasta !== null) {
      where.orden.fechaEntrada = {}
      if (rango.desde !== null) where.orden.fechaEntrada.gte = rango.desde
      if (rango.hasta !== null) where.orden.fechaEntrada.lte = rango.hasta
    }

    if (req.query.mecanicoId !== undefined && String(req.query.mecanicoId).trim() !== '') {
      const mecanicoId = parseId(req.query.mecanicoId)
      if (mecanicoId === null) {
        return res.status(400).json({ error: 'mecanicoId no válido' })
      }
      where.orden.mecanicoId = mecanicoId
    }

    // La búsqueda por texto se aplica en memoria (más abajo), ignorando
    // mayúsculas y acentos; SQLite no ignora los diacríticos.
    const q = textoDeQuery(req.query.q)

    const filtroArticulo = {}
    const familia = textoDeQuery(req.query.familia)
    if (familia !== null) filtroArticulo.familia = familia
    const proveedor = textoDeQuery(req.query.proveedor)
    if (proveedor !== null) filtroArticulo.proveedor = proveedor
    if (Object.keys(filtroArticulo).length > 0) where.articulo = filtroArticulo

    const lineas = await prisma.ordenMaterial.findMany({
      where,
      select: {
        articuloId: true,
        referencia: true,
        descripcion: true,
        cantidad: true,
        precioNeto: true,
        orden: { select: { id: true, fechaEntrada: true } },
        articulo: { select: { familia: true, proveedor: true, precioCompra: true } },
      },
    })

    const datos = lineas.map((linea) => ({
      articuloId: linea.articuloId,
      referencia: linea.referencia,
      descripcion: linea.descripcion,
      cantidad: linea.cantidad,
      precioNeto: linea.precioNeto,
      fecha: linea.orden.fechaEntrada,
      ordenId: linea.orden.id,
      familia: linea.articulo?.familia ?? null,
      proveedor: linea.articulo?.proveedor ?? null,
      precioCompra: linea.articulo?.precioCompra ?? 0,
    }))

    const datosFiltrados = q === null
      ? datos
      : datos.filter((linea) => coincideTexto([linea.referencia, linea.descripcion], q))

    const resultado = agruparConsumo(datosFiltrados, { desde: desdeTexto, hasta: hastaTexto, agrupar })

    return res.json({
      desde: desdeTexto,
      hasta: hastaTexto,
      agrupar,
      ...resultado,
    })
  } catch (error) {
    return next(error)
  }
})

// GET /:id -> artículo concreto
// GET /consumo-serie -> serie continua de consumo por periodo (semanas, meses,
// trimestres o años) para la gráfica de «Artículos > Consumo». Con `referencia`
// se limita a un artículo; sin ella se suman TODOS los productos (modo «todos»).
// Reutiliza los mismos filtros de estados, mecánico, familia y proveedor que
// /consumo. Debe declararse ANTES de '/:id' para que no la capture esa ruta.
router.get('/consumo-serie', async (req, res, next) => {
  try {
    // Referencia opcional: null => modo «todos los productos».
    const referencia = textoDeQuery(req.query.referencia)

    const agrupar = textoDeQuery(req.query.agrupar) ?? 'semana'
    if (!AGRUPACIONES_SERIE.includes(agrupar)) {
      return res.status(400).json({ error: `agrupar debe ser uno de: ${AGRUPACIONES_SERIE.join(', ')}` })
    }

    // Periodos: por defecto 12 semanas, 12 meses, 8 trimestres o 5 años; 1-120 si se indica.
    let periodos = PERIODOS_POR_DEFECTO[agrupar]
    const periodosTexto = textoDeQuery(req.query.periodos)
    if (periodosTexto !== null) {
      periodos = Number(periodosTexto)
      if (!Number.isInteger(periodos) || periodos < 1 || periodos > 120) {
        return res.status(400).json({ error: 'periodos debe ser un entero entre 1 y 120' })
      }
    }

    // Por defecto se incluyen todos los estados.
    const estados = resolverEstados(req.query.estados)

    // Rango de la serie (inicio del primer periodo y fin del último) calculado sin
    // datos: solo sirve para limitar la consulta a las líneas de ese intervalo.
    const { desde, hasta } = serieConsumo([], { agrupar, periodos })
    const rango = rangoDeFechas(desde, hasta)

    const where = {
      orden: {
        estado: { in: estados },
        fechaEntrada: { gte: rango.desde, lte: rango.hasta },
      },
    }
    // En modo un artículo se filtra por su referencia; en modo «todos», no.
    if (referencia !== null) where.referencia = referencia

    if (req.query.mecanicoId !== undefined && String(req.query.mecanicoId).trim() !== '') {
      const mecanicoId = parseId(req.query.mecanicoId)
      if (mecanicoId === null) {
        return res.status(400).json({ error: 'mecanicoId no válido' })
      }
      where.orden.mecanicoId = mecanicoId
    }

    // Filtros de familia y proveedor, igual que en /consumo.
    const filtroArticulo = {}
    const familia = textoDeQuery(req.query.familia)
    if (familia !== null) filtroArticulo.familia = familia
    const proveedor = textoDeQuery(req.query.proveedor)
    if (proveedor !== null) filtroArticulo.proveedor = proveedor
    if (Object.keys(filtroArticulo).length > 0) where.articulo = filtroArticulo

    // En modo «todos» solo se cargan los campos imprescindibles.
    const lineas = await prisma.ordenMaterial.findMany({
      where,
      select: referencia !== null
        ? { descripcion: true, cantidad: true, precioNeto: true, orden: { select: { id: true, fechaEntrada: true } } }
        : { referencia: true, cantidad: true, precioNeto: true, orden: { select: { id: true, fechaEntrada: true } } },
    })

    let datos
    let descripcion
    if (referencia !== null) {
      datos = lineas.map((linea) => ({
        referencia,
        cantidad: linea.cantidad,
        precioNeto: linea.precioNeto,
        fecha: linea.orden.fechaEntrada,
        ordenId: linea.orden.id,
      }))

      // Descripción: la de la línea más reciente o, si no hay líneas, la del catálogo.
      let masReciente = null
      for (const linea of lineas) {
        if (masReciente === null || new Date(linea.orden.fechaEntrada) > new Date(masReciente.orden.fechaEntrada)) {
          masReciente = linea
        }
      }
      descripcion = masReciente?.descripcion || null
      if (!descripcion) {
        const articulo = await prisma.articulo.findFirst({ where: { referencia }, select: { descripcion: true } })
        descripcion = articulo?.descripcion ?? null
      }
    } else {
      // Modo «todos»: cada línea aporta su referencia para contar artículos distintos.
      datos = lineas.map((linea) => ({
        referencia: linea.referencia,
        cantidad: linea.cantidad,
        precioNeto: linea.precioNeto,
        fecha: linea.orden.fechaEntrada,
        ordenId: linea.orden.id,
      }))
      descripcion = null
    }

    const serie = serieConsumo(datos, { agrupar, periodos })

    return res.json({ referencia: referencia ?? null, descripcion, ...serie })
  } catch (error) {
    return next(error)
  }
})

// GET /:id -> artículo concreto
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(400).json({ error: 'Identificador de artículo no válido' })
    }

    const articulo = await prisma.articulo.findUnique({ where: { id } })
    if (!articulo) {
      return res.status(404).json({ error: 'Artículo no encontrado' })
    }

    return res.json(conPrecioSinIva(articulo))
  } catch (error) {
    return next(error)
  }
})

// POST / -> crear artículo (verificando que la referencia sea única)
router.post('/', async (req, res, next) => {
  try {
    const { datos, error } = construirDatosArticulo(req.body ?? {})
    if (error) {
      return res.status(400).json({ error })
    }

    const existente = await prisma.articulo.findUnique({ where: { referencia: datos.referencia } })
    if (existente) {
      return res.status(409).json({ error: 'Ya existe un artículo con esa referencia' })
    }

    // Fecha desde la que queda sin stock (el stock por defecto es 0).
    datos.sinStockDesde = sinStockDesdeNuevo(datos.stock ?? 0, null)

    const articulo = await prisma.articulo.create({ data: datos })
    return res.status(201).json(conPrecioSinIva(articulo))
  } catch (error) {
    return next(error)
  }
})

// PUT /:id -> actualizar artículo
router.put('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(400).json({ error: 'Identificador de artículo no válido' })
    }

    const existente = await prisma.articulo.findUnique({ where: { id } })
    if (!existente) {
      return res.status(404).json({ error: 'Artículo no encontrado' })
    }

    const { datos, error } = construirDatosArticulo(req.body ?? {}, { parcial: true })
    if (error) {
      return res.status(400).json({ error })
    }
    if (Object.keys(datos).length === 0) {
      return res.status(400).json({ error: 'No se han proporcionado campos para actualizar' })
    }

    if (datos.referencia !== undefined && datos.referencia !== existente.referencia) {
      const duplicado = await prisma.articulo.findUnique({ where: { referencia: datos.referencia } })
      if (duplicado) {
        return res.status(409).json({ error: 'Ya existe un artículo con esa referencia' })
      }
    }

    // Si cambia el stock, se recalcula la fecha sin stock conservando la anterior.
    if (datos.stock !== undefined) {
      datos.sinStockDesde = sinStockDesdeNuevo(datos.stock, existente.sinStockDesde)
    }

    const articulo = await prisma.articulo.update({ where: { id }, data: datos })
    return res.json(conPrecioSinIva(articulo))
  } catch (error) {
    return next(error)
  }
})

// PATCH /:id/stock -> gestionar el stock de un artículo.
// Acepta `cantidad` (entrada si es positiva, salida si es negativa) o `stock` (valor absoluto).
router.patch('/:id/stock', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(400).json({ error: 'Identificador de artículo no válido' })
    }

    const existente = await prisma.articulo.findUnique({ where: { id } })
    if (!existente) {
      return res.status(404).json({ error: 'Artículo no encontrado' })
    }

    const body = req.body ?? {}
    let nuevoStock
    if (body.stock !== undefined) {
      const stock = numeroNoNegativo(body.stock)
      if (stock === null) {
        return res.status(400).json({ error: 'El stock debe ser un número válido mayor o igual que 0' })
      }
      nuevoStock = stock
    } else if (body.cantidad !== undefined) {
      const cantidad = numeroFinito(body.cantidad)
      if (cantidad === null) {
        return res.status(400).json({ error: 'La cantidad debe ser un número válido' })
      }
      nuevoStock = existente.stock + cantidad
    } else {
      return res.status(400).json({ error: 'Debes indicar "cantidad" (entrada/salida) o "stock" (valor final)' })
    }

    if (nuevoStock < 0) {
      return res.status(400).json({ error: 'El stock resultante no puede ser negativo' })
    }

    const sinStockDesde = sinStockDesdeNuevo(nuevoStock, existente.sinStockDesde)

    const articulo = await prisma.articulo.update({ where: { id }, data: { stock: nuevoStock, sinStockDesde } })
    return res.json(conPrecioSinIva(articulo))
  } catch (error) {
    return next(error)
  }
})

// DELETE /lote -> eliminar varios artículos a la vez (solo administradores).
// Debe declararse ANTES de '/:id' para que no lo capture la ruta con parámetro.
router.delete('/lote', roleMiddleware('admin'), async (req, res, next) => {
  try {
    const { ids } = req.body ?? {}
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Debes indicar una lista de identificadores de artículos' })
    }
    if (ids.length > 1000) {
      return res.status(400).json({ error: 'No se pueden eliminar más de 1000 artículos a la vez' })
    }
    for (const id of ids) {
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'La lista de identificadores no es válida' })
      }
    }

    // Guarda una instantánea de cada artículo (con las líneas de orden que lo
    // usaban) antes de borrarlos: el borrado en lote no pasa por /:id.
    const articulos = await prisma.articulo.findMany({ where: { id: { in: ids } } })
    const instantaneas = []
    for (const articulo of articulos) {
      const lineas = await prisma.ordenMaterial.findMany({ where: { articuloId: articulo.id }, select: { id: true } })
      instantaneas.push({ articulo, lineas: lineas.map((linea) => linea.id) })
    }

    const usuario = req.user?.nombre ?? req.user?.username ?? null
    const resultado = await prisma.$transaction(async (tx) => {
      let papeleraId = null
      if (instantaneas.length > 0) {
        const creada = await guardarEnPapelera(tx, {
          tipo: 'articulos-lote',
          descripcion: `${instantaneas.length} artículos eliminados en lote`,
          datos: { articulos: instantaneas },
          usuario,
        })
        papeleraId = creada.id
      }
      const borrado = await tx.articulo.deleteMany({ where: { id: { in: ids } } })
      return { eliminados: borrado.count, papeleraId }
    })
    return res.json(resultado)
  } catch (error) {
    return next(error)
  }
})

// DELETE /:id -> eliminar artículo
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(400).json({ error: 'Identificador de artículo no válido' })
    }

    const existente = await prisma.articulo.findUnique({ where: { id } })
    if (!existente) {
      return res.status(404).json({ error: 'Artículo no encontrado' })
    }

    // Archiva el artículo y las líneas de orden que lo usaban antes de borrarlo.
    const lineas = await prisma.ordenMaterial.findMany({ where: { articuloId: id }, select: { id: true } })
    const usuario = req.user?.nombre ?? req.user?.username ?? null
    const { id: papeleraId } = await prisma.$transaction(async (tx) => {
      const creada = await guardarEnPapelera(tx, {
        tipo: 'articulo',
        descripcion: descripcionArticulo(existente),
        datos: { articulo: existente, lineas: lineas.map((linea) => linea.id) },
        usuario,
      })
      await tx.articulo.delete({ where: { id } })
      return creada
    })
    return res.json({ success: true, papeleraId })
  } catch (error) {
    return next(error)
  }
})

export default router

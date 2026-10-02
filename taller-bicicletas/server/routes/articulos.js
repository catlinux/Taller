import { Router } from 'express'
import prisma from '../db.js'
import { authMiddleware } from './auth.js'
import { precioSinIva } from '../lib/precios.js'
import { sinStockDesdeNuevo } from '../lib/stock.js'

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

    await prisma.articulo.delete({ where: { id } })
    return res.json({ success: true })
  } catch (error) {
    return next(error)
  }
})

export default router

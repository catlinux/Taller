import { Router } from 'express'
import prisma from '../db.js'
import { authMiddleware } from './auth.js'

const router = Router()

// Todas las rutas de clientes requieren autenticación
router.use(authMiddleware)

// Campos de texto opcionales que acepta el modelo Cliente
const CAMPOS_TEXTO_OPCIONALES = [
  'apellidos',
  'dni',
  'direccion',
  'codigoPostal',
  'poblacion',
  'provincia',
  'telefono',
  'email',
]

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

// Valida y construye los datos de un cliente a partir del cuerpo de la petición.
// Con `parcial: true` solo se tienen en cuenta los campos presentes (actualización).
function construirDatosCliente(body, { parcial = false } = {}) {
  const datos = {}

  if (body.nombre !== undefined || !parcial) {
    if (typeof body.nombre !== 'string' || !body.nombre.trim()) {
      return { error: 'El nombre es obligatorio y debe ser una cadena de texto' }
    }
    datos.nombre = body.nombre.trim()
  }

  if (body.numeroCliente !== undefined) {
    const numeroCliente = Number(body.numeroCliente)
    if (!Number.isInteger(numeroCliente) || numeroCliente <= 0) {
      return { error: 'El número de cliente debe ser un entero positivo' }
    }
    datos.numeroCliente = numeroCliente
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

// GET / -> lista de clientes con el número de bicicletas asociadas.
// Admite búsqueda por ?q=: número de cliente (exacto si es un entero), DNI,
// teléfono, nombre, apellidos o email (contiene).
router.get('/', async (req, res, next) => {
  try {
    const where = {}
    if (req.query.q !== undefined) {
      const q = String(req.query.q).trim()
      if (q !== '') {
        const condiciones = [
          { nombre: { contains: q } },
          { apellidos: { contains: q } },
          { dni: { contains: q } },
          { telefono: { contains: q } },
          { email: { contains: q } },
        ]
        // Si el texto es un entero, busca también por número de cliente exacto
        const numeroCliente = Number(q)
        if (Number.isInteger(numeroCliente)) {
          condiciones.push({ numeroCliente })
        }
        where.OR = condiciones
      }
    }

    const clientes = await prisma.cliente.findMany({
      where,
      orderBy: { nombre: 'asc' },
      include: { _count: { select: { bicicletas: true } } },
    })
    return res.json(clientes)
  } catch (error) {
    return next(error)
  }
})

// GET /:id -> cliente concreto con sus bicicletas y su historial de reparaciones
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(400).json({ error: 'Identificador de cliente no válido' })
    }

    const cliente = await prisma.cliente.findUnique({
      where: { id },
      include: {
        bicicletas: true,
        ordenes: {
          orderBy: { fechaEntrada: 'desc' },
          select: {
            id: true,
            numeroOrden: true,
            fechaEntrada: true,
            estado: true,
            total: true,
            bicicleta: { select: { marca: true, modelo: true } },
          },
        },
      },
    })
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente no encontrado' })
    }

    return res.json(cliente)
  } catch (error) {
    return next(error)
  }
})

// POST / -> crear cliente
router.post('/', async (req, res, next) => {
  try {
    const { datos, error } = construirDatosCliente(req.body ?? {})
    if (error) {
      return res.status(400).json({ error })
    }

    // Si no se indica número de cliente, se asigna el siguiente disponible
    if (datos.numeroCliente === undefined) {
      const ultimo = await prisma.cliente.findFirst({ orderBy: { numeroCliente: 'desc' } })
      datos.numeroCliente = (ultimo?.numeroCliente ?? 0) + 1
    }

    const existente = await prisma.cliente.findUnique({
      where: { numeroCliente: datos.numeroCliente },
    })
    if (existente) {
      return res.status(409).json({ error: 'Ya existe un cliente con ese número de cliente' })
    }

    const cliente = await prisma.cliente.create({ data: datos })
    return res.status(201).json(cliente)
  } catch (error) {
    return next(error)
  }
})

// PUT /:id -> actualizar cliente
router.put('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(400).json({ error: 'Identificador de cliente no válido' })
    }

    const existente = await prisma.cliente.findUnique({ where: { id } })
    if (!existente) {
      return res.status(404).json({ error: 'Cliente no encontrado' })
    }

    const { datos, error } = construirDatosCliente(req.body ?? {}, { parcial: true })
    if (error) {
      return res.status(400).json({ error })
    }
    if (Object.keys(datos).length === 0) {
      return res.status(400).json({ error: 'No se han proporcionado campos para actualizar' })
    }

    if (datos.numeroCliente !== undefined && datos.numeroCliente !== existente.numeroCliente) {
      const duplicado = await prisma.cliente.findUnique({
        where: { numeroCliente: datos.numeroCliente },
      })
      if (duplicado) {
        return res.status(409).json({ error: 'Ya existe un cliente con ese número de cliente' })
      }
    }

    const cliente = await prisma.cliente.update({ where: { id }, data: datos })
    return res.json(cliente)
  } catch (error) {
    return next(error)
  }
})

// DELETE /:id -> eliminar cliente y, en cascada, sus bicicletas.
// No se permite borrar un cliente que tenga órdenes (el historial nunca se pierde).
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(400).json({ error: 'Identificador de cliente no válido' })
    }

    const existente = await prisma.cliente.findUnique({ where: { id } })
    if (!existente) {
      return res.status(404).json({ error: 'Cliente no encontrado' })
    }

    const numOrdenes = await prisma.ordenReparacion.count({ where: { clienteId: id } })
    if (numOrdenes > 0) {
      return res.status(409).json({
        error: `No se puede eliminar el cliente porque tiene ${numOrdenes} órdenes de reparación. Su historial debe conservarse.`,
      })
    }

    await prisma.$transaction([
      prisma.bicicleta.deleteMany({ where: { clienteId: id } }),
      prisma.cliente.delete({ where: { id } }),
    ])

    return res.json({ success: true })
  } catch (error) {
    return next(error)
  }
})

export default router

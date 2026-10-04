import { Router } from 'express'
import prisma from '../db.js'
import { authMiddleware } from './auth.js'
import { guardarEnPapelera, descripcionBicicleta } from '../lib/papelera.js'

const router = Router()

// Todas las rutas de bicicletas requieren autenticación
router.use(authMiddleware)

// Valores permitidos para el campo `tipo` de una bicicleta
export const TIPOS_BICICLETA = [
  'BiciInfantil',
  'XC',
  'Trail',
  'Enduro',
  'Descens',
  'Passeig',
  'Gravel',
  'Carretera',
  'Triatlo',
  'EBikePasseig',
  'EBikeXC',
  'EBikeEnduro',
  'EBikeGravel',
  'EBikeCarretera',
]

// Campos de texto opcionales que acepta el modelo Bicicleta
const CAMPOS_TEXTO_OPCIONALES = ['modelo', 'color', 'numeroSerie', 'tamano', 'observaciones']

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

// Valida y construye los datos de una bicicleta a partir del cuerpo de la petición.
// Con `parcial: true` solo se tienen en cuenta los campos presentes (actualización).
function construirDatosBicicleta(body, { parcial = false } = {}) {
  const datos = {}

  if (body.clienteId !== undefined || !parcial) {
    const clienteId = Number(body.clienteId)
    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      return { error: 'El cliente es obligatorio y debe ser un identificador válido' }
    }
    datos.clienteId = clienteId
  }

  if (body.marca !== undefined || !parcial) {
    if (typeof body.marca !== 'string' || !body.marca.trim()) {
      return { error: 'La marca es obligatoria y debe ser una cadena de texto' }
    }
    datos.marca = body.marca.trim()
  }

  if (body.tipo !== undefined) {
    if (typeof body.tipo !== 'string' || !TIPOS_BICICLETA.includes(body.tipo)) {
      return {
        error: `Tipo de bicicleta no válido. Valores permitidos: ${TIPOS_BICICLETA.join(', ')}`,
      }
    }
    datos.tipo = body.tipo
  } else if (!parcial) {
    datos.tipo = 'Carretera'
  }

  if (body.anio !== undefined) {
    if (body.anio === null || body.anio === '') {
      datos.anio = null
    } else {
      const anio = Number(body.anio)
      if (!Number.isInteger(anio) || anio < 1900 || anio > 2100) {
        return { error: 'El año debe ser un número entero válido' }
      }
      datos.anio = anio
    }
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

// GET / -> lista de bicicletas (opcionalmente filtradas por ?clienteId=)
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

    const bicicletas = await prisma.bicicleta.findMany({
      where,
      orderBy: { id: 'asc' },
      include: { cliente: true },
    })
    return res.json(bicicletas)
  } catch (error) {
    return next(error)
  }
})

// GET /:id -> bicicleta concreta con su cliente y su historial de reparaciones
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(400).json({ error: 'Identificador de bicicleta no válido' })
    }

    const bicicleta = await prisma.bicicleta.findUnique({
      where: { id },
      include: {
        cliente: true,
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
    if (!bicicleta) {
      return res.status(404).json({ error: 'Bicicleta no encontrada' })
    }

    return res.json(bicicleta)
  } catch (error) {
    return next(error)
  }
})

// POST / -> crear bicicleta (verificando que el cliente existe)
router.post('/', async (req, res, next) => {
  try {
    const { datos, error } = construirDatosBicicleta(req.body ?? {})
    if (error) {
      return res.status(400).json({ error })
    }

    const cliente = await prisma.cliente.findUnique({ where: { id: datos.clienteId } })
    if (!cliente) {
      return res.status(404).json({ error: 'El cliente indicado no existe' })
    }

    const bicicleta = await prisma.bicicleta.create({ data: datos })
    return res.status(201).json(bicicleta)
  } catch (error) {
    return next(error)
  }
})

// PUT /:id -> actualizar bicicleta
router.put('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(400).json({ error: 'Identificador de bicicleta no válido' })
    }

    const existente = await prisma.bicicleta.findUnique({ where: { id } })
    if (!existente) {
      return res.status(404).json({ error: 'Bicicleta no encontrada' })
    }

    const { datos, error } = construirDatosBicicleta(req.body ?? {}, { parcial: true })
    if (error) {
      return res.status(400).json({ error })
    }
    if (Object.keys(datos).length === 0) {
      return res.status(400).json({ error: 'No se han proporcionado campos para actualizar' })
    }

    if (datos.clienteId !== undefined && datos.clienteId !== existente.clienteId) {
      const cliente = await prisma.cliente.findUnique({ where: { id: datos.clienteId } })
      if (!cliente) {
        return res.status(404).json({ error: 'El cliente indicado no existe' })
      }
    }

    const bicicleta = await prisma.bicicleta.update({ where: { id }, data: datos })
    return res.json(bicicleta)
  } catch (error) {
    return next(error)
  }
})

// DELETE /:id -> eliminar bicicleta.
// No se permite borrar una bicicleta que tenga órdenes (el historial nunca se pierde).
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(400).json({ error: 'Identificador de bicicleta no válido' })
    }

    const existente = await prisma.bicicleta.findUnique({ where: { id } })
    if (!existente) {
      return res.status(404).json({ error: 'Bicicleta no encontrada' })
    }

    const numOrdenes = await prisma.ordenReparacion.count({ where: { bicicletaId: id } })
    if (numOrdenes > 0) {
      return res.status(409).json({
        error: `No se puede eliminar la bicicleta porque tiene ${numOrdenes} órdenes de reparación. Su historial debe conservarse.`,
      })
    }

    const usuario = req.user?.nombre ?? req.user?.username ?? null
    const { id: papeleraId } = await prisma.$transaction(async (tx) => {
      const creada = await guardarEnPapelera(tx, {
        tipo: 'bicicleta',
        descripcion: descripcionBicicleta(existente),
        datos: { bicicleta: existente },
        usuario,
      })
      await tx.bicicleta.delete({ where: { id } })
      return creada
    })
    return res.json({ success: true, papeleraId })
  } catch (error) {
    return next(error)
  }
})

export default router

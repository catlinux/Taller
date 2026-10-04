import { Router } from 'express'
import prisma from '../db.js'
import { authMiddleware, roleMiddleware } from './auth.js'
import { guardarEnPapelera, descripcionOperacion } from '../lib/papelera.js'
import { coincideTexto } from '../lib/texto.js'

const router = Router()
router.use(authMiddleware)

function parseId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

function numeroNoNegativo(value) {
  if (value === null || value === '' || typeof value === 'boolean' || Array.isArray(value) || typeof value === 'object') return null
  const parsed = typeof value === 'string' ? Number(value.trim()) : Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function construirDatos(body, parcial = false) {
  const datos = {}
  for (const campo of ['codigo', 'descripcion']) {
    if (body[campo] !== undefined || !parcial) {
      if (typeof body[campo] !== 'string' || !body[campo].trim()) return { error: `El campo ${campo} es obligatorio y debe ser una cadena de texto` }
      datos[campo] = body[campo].trim()
    }
  }
  for (const campo of ['tiempoDefecto', 'precioHoraDefecto']) {
    if (body[campo] !== undefined) {
      const valor = numeroNoNegativo(body[campo])
      if (valor === null) return { error: `El campo ${campo} debe ser un número válido mayor o igual que 0` }
      datos[campo] = valor
    }
  }
  if (body.activo !== undefined) {
    if (typeof body.activo !== 'boolean') return { error: 'El campo activo debe ser booleano' }
    datos.activo = body.activo
  }
  return { datos }
}

function esDuplicado(error) { return error?.code === 'P2002' }

router.get('/', async (req, res, next) => {
  try {
    const where = {}
    if (req.query.todas !== '1') where.activo = true
    const operaciones = await prisma.operacionManoObra.findMany({ where, orderBy: { id: 'asc' } })

    // Búsqueda por ?q= en código o descripción, ignorando mayúsculas y acentos
    // (se resuelve en memoria, porque SQLite no ignora los diacríticos).
    const q = req.query.q !== undefined ? String(req.query.q).trim() : ''
    if (q === '') return res.json(operaciones)

    return res.json(operaciones.filter((operacion) => coincideTexto([operacion.codigo, operacion.descripcion], q)))
  } catch (error) { return next(error) }
})

router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) return res.status(400).json({ error: 'Identificador de operación no válido' })
    const operacion = await prisma.operacionManoObra.findUnique({ where: { id } })
    if (!operacion) return res.status(404).json({ error: 'Operación no encontrada' })
    return res.json(operacion)
  } catch (error) { return next(error) }
})

router.post('/', roleMiddleware('admin'), async (req, res, next) => {
  try {
    const { datos, error } = construirDatos(req.body ?? {})
    if (error) return res.status(400).json({ error })
    const existente = await prisma.operacionManoObra.findUnique({ where: { codigo: datos.codigo } })
    if (existente) return res.status(409).json({ error: 'Ya existe una operación con ese código' })
    try {
      const operacion = await prisma.operacionManoObra.create({ data: datos })
      return res.status(201).json(operacion)
    } catch (error) {
      if (esDuplicado(error)) return res.status(409).json({ error: 'Ya existe una operación con ese código' })
      throw error
    }
  } catch (error) { return next(error) }
})

router.put('/:id', roleMiddleware('admin'), async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) return res.status(400).json({ error: 'Identificador de operación no válido' })
    const existente = await prisma.operacionManoObra.findUnique({ where: { id } })
    if (!existente) return res.status(404).json({ error: 'Operación no encontrada' })
    const { datos, error } = construirDatos(req.body ?? {}, true)
    if (error) return res.status(400).json({ error })
    if (Object.keys(datos).length === 0) return res.status(400).json({ error: 'No se han proporcionado campos para actualizar' })
    if (datos.codigo !== undefined && datos.codigo !== existente.codigo) {
      const duplicado = await prisma.operacionManoObra.findUnique({ where: { codigo: datos.codigo } })
      if (duplicado) return res.status(409).json({ error: 'Ya existe una operación con ese código' })
    }
    try {
      const operacion = await prisma.operacionManoObra.update({ where: { id }, data: datos })
      return res.json(operacion)
    } catch (error) {
      if (esDuplicado(error)) return res.status(409).json({ error: 'Ya existe una operación con ese código' })
      throw error
    }
  } catch (error) { return next(error) }
})

router.delete('/:id', roleMiddleware('admin'), async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) return res.status(400).json({ error: 'Identificador de operación no válido' })
    const existente = await prisma.operacionManoObra.findUnique({ where: { id } })
    if (!existente) return res.status(404).json({ error: 'Operación no encontrada' })
    const usuario = req.user?.nombre ?? req.user?.username ?? null
    const { id: papeleraId } = await prisma.$transaction(async (tx) => {
      const creada = await guardarEnPapelera(tx, {
        tipo: 'operacion',
        descripcion: descripcionOperacion(existente),
        datos: { operacion: existente },
        usuario,
      })
      await tx.operacionManoObra.delete({ where: { id } })
      return creada
    })
    return res.json({ success: true, papeleraId })
  } catch (error) { return next(error) }
})

export default router

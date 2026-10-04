import { Router } from 'express'
import prisma from '../db.js'
import { authMiddleware, roleMiddleware } from './auth.js'
import { guardarEnPapelera, descripcionMecanico } from '../lib/papelera.js'

const router = Router()
router.use(authMiddleware)

function parseId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

const CAMPOS_PUBLICOS = { id: true, nombre: true, activo: true }

function construirDatos(body, parcial = false) {
  const datos = {}
  if (body.nombre !== undefined || !parcial) {
    if (typeof body.nombre !== 'string' || !body.nombre.trim()) return { error: 'El nombre es obligatorio y debe ser una cadena de texto' }
    datos.nombre = body.nombre.trim()
  }
  if (body.activo !== undefined) {
    if (typeof body.activo !== 'boolean') return { error: 'El campo activo debe ser booleano' }
    datos.activo = body.activo
  }
  return { datos }
}

function esDuplicado(error) { return error?.code === 'P2002' }

// GET / -> lista de mecánicos. Por defecto solo los activos; con ?todos=1 se
// incluyen también los inactivos. Accesible a cualquier usuario autenticado.
router.get('/', async (req, res, next) => {
  try {
    const where = {}
    if (req.query.todos !== '1') where.activo = true
    const mecanicos = await prisma.mecanico.findMany({ where, select: CAMPOS_PUBLICOS, orderBy: { nombre: 'asc' } })
    return res.json(mecanicos)
  } catch (error) { return next(error) }
})

router.post('/', roleMiddleware('admin'), async (req, res, next) => {
  try {
    const { datos, error } = construirDatos(req.body ?? {})
    if (error) return res.status(400).json({ error })
    const existente = await prisma.mecanico.findUnique({ where: { nombre: datos.nombre } })
    if (existente) return res.status(409).json({ error: 'Ya existe un mecánico con ese nombre' })
    try {
      const mecanico = await prisma.mecanico.create({ data: datos, select: CAMPOS_PUBLICOS })
      return res.status(201).json(mecanico)
    } catch (error) {
      if (esDuplicado(error)) return res.status(409).json({ error: 'Ya existe un mecánico con ese nombre' })
      throw error
    }
  } catch (error) { return next(error) }
})

router.put('/:id', roleMiddleware('admin'), async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) return res.status(400).json({ error: 'Identificador de mecánico no válido' })
    const existente = await prisma.mecanico.findUnique({ where: { id } })
    if (!existente) return res.status(404).json({ error: 'Mecánico no encontrado' })
    const { datos, error } = construirDatos(req.body ?? {}, true)
    if (error) return res.status(400).json({ error })
    if (Object.keys(datos).length === 0) return res.status(400).json({ error: 'No se han proporcionado campos para actualizar' })
    if (datos.nombre !== undefined && datos.nombre !== existente.nombre) {
      const duplicado = await prisma.mecanico.findUnique({ where: { nombre: datos.nombre } })
      if (duplicado) return res.status(409).json({ error: 'Ya existe un mecánico con ese nombre' })
    }
    try {
      const mecanico = await prisma.mecanico.update({ where: { id }, data: datos, select: CAMPOS_PUBLICOS })
      return res.json(mecanico)
    } catch (error) {
      if (esDuplicado(error)) return res.status(409).json({ error: 'Ya existe un mecánico con ese nombre' })
      throw error
    }
  } catch (error) { return next(error) }
})

router.delete('/:id', roleMiddleware('admin'), async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) return res.status(400).json({ error: 'Identificador de mecánico no válido' })
    const existente = await prisma.mecanico.findUnique({ where: { id } })
    if (!existente) return res.status(404).json({ error: 'Mecánico no encontrado' })
    const ordenesAsignadas = await prisma.ordenReparacion.count({ where: { mecanicoId: id } })
    if (ordenesAsignadas > 0) return res.status(409).json({ error: 'Tiene órdenes asignadas; desactívalo en lugar de borrarlo' })
    const usuario = req.user?.nombre ?? req.user?.username ?? null
    const { id: papeleraId } = await prisma.$transaction(async (tx) => {
      const creada = await guardarEnPapelera(tx, {
        tipo: 'mecanico',
        descripcion: descripcionMecanico(existente),
        datos: { mecanico: existente },
        usuario,
      })
      await tx.mecanico.delete({ where: { id } })
      return creada
    })
    return res.json({ success: true, papeleraId })
  } catch (error) { return next(error) }
})

export default router

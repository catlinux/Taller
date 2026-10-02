import { Router } from 'express'
import bcrypt from 'bcryptjs'
import prisma from '../db.js'
import { authMiddleware, roleMiddleware } from './auth.js'

const router = Router()

// El resto de rutas de usuarios requiere rol admin.
router.use(authMiddleware, roleMiddleware('admin'))

function parseId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

const camposPublicos = { id: true, username: true, nombre: true, rol: true, activo: true, createdAt: true, updatedAt: true }

router.get('/', async (req, res, next) => {
  try {
    const usuarios = await prisma.usuario.findMany({ select: camposPublicos, orderBy: { id: 'asc' } })
    return res.json(usuarios)
  } catch (error) { return next(error) }
})

router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) return res.status(400).json({ error: 'Identificador de usuario no válido' })
    const usuario = await prisma.usuario.findUnique({ where: { id }, select: camposPublicos })
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' })
    return res.json(usuario)
  } catch (error) { return next(error) }
})

router.put('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) return res.status(400).json({ error: 'Identificador de usuario no válido' })
    const existente = await prisma.usuario.findUnique({ where: { id } })
    if (!existente) return res.status(404).json({ error: 'Usuario no encontrado' })

    const body = req.body ?? {}
    const datos = {}
    if (body.nombre !== undefined) {
      if (typeof body.nombre !== 'string' || !body.nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio y debe ser una cadena de texto' })
      datos.nombre = body.nombre.trim()
    }
    if (body.rol !== undefined) {
      if (!['admin', 'mecanico'].includes(body.rol)) return res.status(400).json({ error: 'El rol debe ser admin o mecanico' })
      datos.rol = body.rol
    }
    if (body.activo !== undefined) {
      if (typeof body.activo !== 'boolean') return res.status(400).json({ error: 'El campo activo debe ser booleano' })
      datos.activo = body.activo
    }
    if (body.password !== undefined) {
      if (typeof body.password !== 'string' || body.password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })
      datos.password = await bcrypt.hash(body.password, 10)
    }
    if (Object.keys(datos).length === 0) return res.status(400).json({ error: 'No se han proporcionado campos para actualizar' })

    const usuario = await prisma.usuario.update({ where: { id }, data: datos, select: camposPublicos })
    return res.json(usuario)
  } catch (error) { return next(error) }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) return res.status(400).json({ error: 'Identificador de usuario no válido' })
    if (id === req.user.id) return res.status(400).json({ error: 'No puedes desactivar tu propio usuario' })
    const existente = await prisma.usuario.findUnique({ where: { id } })
    if (!existente) return res.status(404).json({ error: 'Usuario no encontrado' })
    const usuario = await prisma.usuario.update({ where: { id }, data: { activo: false }, select: camposPublicos })
    return res.json(usuario)
  } catch (error) { return next(error) }
})

export default router

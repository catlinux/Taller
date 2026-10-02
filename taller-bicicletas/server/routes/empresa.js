import { Router } from 'express'
import prisma from '../db.js'
import { authMiddleware } from './auth.js'

const router = Router()
router.use(authMiddleware)

const CAMPOS_REQUERIDOS = ['nombre', 'cif', 'direccion', 'codigoPostal', 'ciudad', 'provincia', 'telefono', 'email']
const CAMPOS_OPCIONALES = ['web', 'logoUrl']

function construirDatos(body, parcial = false) {
  const datos = {}
  for (const campo of CAMPOS_REQUERIDOS) {
    if (body[campo] !== undefined || !parcial) {
      if (typeof body[campo] !== 'string' || !body[campo].trim()) {
        return { error: `El campo ${campo} es obligatorio y debe ser una cadena de texto` }
      }
      datos[campo] = body[campo].trim()
    }
  }
  for (const campo of CAMPOS_OPCIONALES) {
    if (body[campo] !== undefined) {
      if (body[campo] !== null && typeof body[campo] !== 'string') {
        return { error: `El campo ${campo} debe ser una cadena de texto` }
      }
      datos[campo] = typeof body[campo] === 'string' ? body[campo].trim() || null : null
    }
  }
  return { datos }
}

function parseId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

router.get('/', async (req, res, next) => {
  try {
    return res.json(await prisma.empresa.findMany({ orderBy: { id: 'asc' } }))
  } catch (error) {
    return next(error)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) return res.status(400).json({ error: 'Identificador de empresa no válido' })
    const empresa = await prisma.empresa.findUnique({ where: { id } })
    if (!empresa) return res.status(404).json({ error: 'Empresa no encontrada' })
    return res.json(empresa)
  } catch (error) {
    return next(error)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const { datos, error } = construirDatos(req.body ?? {})
    if (error) return res.status(400).json({ error })
    const empresa = await prisma.empresa.create({ data: datos })
    return res.status(201).json(empresa)
  } catch (error) {
    return next(error)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) return res.status(400).json({ error: 'Identificador de empresa no válido' })
    const existente = await prisma.empresa.findUnique({ where: { id } })
    if (!existente) return res.status(404).json({ error: 'Empresa no encontrada' })
    const { datos, error } = construirDatos(req.body ?? {}, true)
    if (error) return res.status(400).json({ error })
    if (Object.keys(datos).length === 0) return res.status(400).json({ error: 'No se han proporcionado campos para actualizar' })
    return res.json(await prisma.empresa.update({ where: { id }, data: datos }))
  } catch (error) {
    return next(error)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) return res.status(400).json({ error: 'Identificador de empresa no válido' })
    const existente = await prisma.empresa.findUnique({ where: { id } })
    if (!existente) return res.status(404).json({ error: 'Empresa no encontrada' })
    await prisma.empresa.delete({ where: { id } })
    return res.json({ success: true })
  } catch (error) {
    return next(error)
  }
})

export default router

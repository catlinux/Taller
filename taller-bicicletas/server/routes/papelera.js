import { Router } from 'express'
import prisma from '../db.js'
import { authMiddleware, roleMiddleware } from './auth.js'
import { restaurarEntrada } from '../lib/papelera.js'

const router = Router()

// Tipos cuyo borrado original exigía rol de administrador: restaurarlos exige
// el mismo rol (para el resto basta con estar autenticado).
const TIPOS_SOLO_ADMIN = ['articulos-lote', 'operacion', 'mecanico']

// Todas las rutas de la papelera requieren autenticación
router.use(authMiddleware)

// Convierte un parámetro en un identificador entero positivo o devuelve null
function parseId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

// Lista las entradas de la papelera, de la más reciente a la más antigua. No
// devuelve el JSON (`datos`), que puede ser muy pesado: solo los metadatos.
router.get('/', async (_req, res, next) => {
  try {
    const entradas = await prisma.papelera.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, tipo: true, descripcion: true, usuario: true, createdAt: true },
    })
    res.json({ entradas })
  } catch (error) {
    next(error)
  }
})

// Restaura una entrada: la recrea en su tabla original y la borra de la papelera.
router.post('/:id/restaurar', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) return res.status(400).json({ error: 'Identificador no válido' })
    const entrada = await prisma.papelera.findUnique({ where: { id } })
    if (!entrada) return res.status(404).json({ error: 'La entrada no existe en la papelera' })
    if (TIPOS_SOLO_ADMIN.includes(entrada.tipo) && req.user?.rol !== 'admin') {
      return res.status(403).json({ error: 'No tienes permisos para restaurar esta entrada' })
    }
    await restaurarEntrada(prisma, entrada)
    res.json({ ok: true, tipo: entrada.tipo, descripcion: entrada.descripcion })
  } catch (error) {
    if (error?.status) return res.status(error.status).json({ error: error.message })
    next(error)
  }
})

// Vacía la papelera por completo (borrado definitivo de todas las entradas).
router.delete('/', roleMiddleware('admin'), async (_req, res, next) => {
  try {
    const { count } = await prisma.papelera.deleteMany({})
    res.json({ eliminadas: count })
  } catch (error) {
    next(error)
  }
})

// Borra definitivamente una única entrada de la papelera.
router.delete('/:id', roleMiddleware('admin'), async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) return res.status(400).json({ error: 'Identificador no válido' })
    const entrada = await prisma.papelera.findUnique({ where: { id } })
    if (!entrada) return res.status(404).json({ error: 'La entrada no existe en la papelera' })
    await prisma.papelera.delete({ where: { id } })
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

export default router

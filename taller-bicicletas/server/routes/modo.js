import { Router } from 'express'
import { cambiarModo, demoExiste, modoActual } from '../db.js'
import { authMiddleware, roleMiddleware } from './auth.js'

const router = Router()

// GET /publico -> modo activo (sin login, para mostrar el aviso en el acceso)
router.get('/publico', (req, res) => {
  res.json({ modo: modoActual() })
})

// GET / -> estado completo (solo admin)
router.get('/', authMiddleware, roleMiddleware('admin'), (req, res) => {
  res.json({ modo: modoActual(), demoExiste: demoExiste() })
})

// PUT / { modo } -> cambia entre la base real y la de prueba (solo admin)
router.put('/', authMiddleware, roleMiddleware('admin'), async (req, res, next) => {
  try {
    const modo = req.body?.modo
    if (modo !== 'real' && modo !== 'demo') {
      return res.status(400).json({ error: "El modo debe ser 'real' o 'demo'" })
    }
    await cambiarModo(modo)
    return res.json({ modo: modoActual(), demoExiste: demoExiste() })
  } catch (error) {
    return next(error)
  }
})

export default router

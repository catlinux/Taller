import { Router } from 'express'
import prisma from '../db.js'
import { authMiddleware, roleMiddleware } from './auth.js'
import { IMPORTACIONES } from '../lib/importar.js'
import { validarCuerpo } from '../lib/importarCuerpo.js'
import { crearBackup } from './backups.js'

const router = Router()

// Todas las rutas de importación son exclusivas del rol admin.
router.use(authMiddleware, roleMiddleware('admin'))

// Marca para serializar las importaciones: solo una a la vez sobre la misma base.
let importando = false

// Los errores de formato del fichero son Error normales (sin nombre especial) y se
// devuelven como 400 con su mensaje. Los de la base de datos u otros (Prisma, etc.)
// llevan su propio nombre y se dejan pasar a next().
function esErrorDelFichero(error) {
  return error instanceof Error && error.name === 'Error'
}

// POST /:tipo { contenido, simular } -> simula (simular:true) o importa un listado CSV.
router.post('/:tipo', async (req, res, next) => {
  const validacion = validarCuerpo(req.params.tipo, req.body ?? {})
  if (validacion.error) {
    return res.status(validacion.status).json({ error: validacion.error })
  }

  // Si ya hay otra importación en curso, no se solapan dos escrituras.
  if (importando) {
    return res.status(409).json({ error: 'Ya hay una importación en curso' })
  }

  const importar = IMPORTACIONES[validacion.tipo]

  // Simulación: no escribe nada ni crea copia de seguridad.
  if (validacion.simular) {
    try {
      const resumen = await importar(prisma, validacion.contenido, { simular: true })
      return res.json(resumen)
    } catch (error) {
      if (esErrorDelFichero(error)) return res.status(400).json({ error: error.message })
      return next(error)
    }
  }

  importando = true
  try {
    // Copia de seguridad obligatoria antes de escribir: si falla, no se importa nada.
    let backup
    try {
      backup = await crearBackup('manual')
    } catch {
      return res.status(500).json({ error: 'No se pudo crear la copia de seguridad previa; no se ha importado nada' })
    }

    const resumen = await importar(prisma, validacion.contenido)
    return res.json({ ...resumen, backup: backup.filename ?? backup.id })
  } catch (error) {
    if (esErrorDelFichero(error)) return res.status(400).json({ error: error.message })
    return next(error)
  } finally {
    importando = false
  }
})

export default router

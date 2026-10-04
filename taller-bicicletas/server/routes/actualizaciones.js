import { Router } from 'express'
import { authMiddleware, roleMiddleware } from './auth.js'
import { crearBackup } from './backups.js'
import {
  aplicarActualizacion,
  leerVersionLocal,
  esRepositorioGit,
  estadoActualizaciones,
  ejecutarComprobacion,
  leerUltimaActualizacion,
} from '../lib/actualizaciones.js'

const router = Router()

// Todas las rutas de actualizaciones son exclusivas del rol admin.
router.use(authMiddleware, roleMiddleware('admin'))

// Solo se permite aplicar cambios cuando estamos en producción y el entorno
// indica que hay un gestor de procesos que reinicia el servicio (ACTUALIZACIONES=auto).
export function aplicarHabilitado() {
  return process.env.NODE_ENV === 'production' && process.env.ACTUALIZACIONES === 'auto'
}

// Estado completo que consume el panel de Configuración.
async function estadoCompleto() {
  estadoActualizaciones.esRepositorio = await esRepositorioGit()
  // La versión instalada se lee siempre que falte, sin esperar a la primera comprobación.
  if (estadoActualizaciones.esRepositorio && !estadoActualizaciones.version) {
    estadoActualizaciones.version = await leerVersionLocal().catch(() => null)
  }
  return {
    ...estadoActualizaciones,
    habilitadoAplicar: aplicarHabilitado(),
    ultimaActualizacion: leerUltimaActualizacion(),
  }
}

// GET / -> estado completo + si se puede aplicar y si es un repositorio git.
router.get('/', async (req, res, next) => {
  try {
    return res.json(await estadoCompleto())
  } catch (error) {
    return next(error)
  }
})

// POST /comprobar -> fuerza una comprobación (git fetch + comparar) y devuelve el estado.
router.post('/comprobar', async (req, res, next) => {
  try {
    await ejecutarComprobacion()
    return res.json(await estadoCompleto())
  } catch (error) {
    return next(error)
  }
})

// POST /aplicar { confirmar: true } -> inicia la actualización en segundo plano.
router.post('/aplicar', async (req, res) => {
  if (req.body?.confirmar !== true) {
    return res.status(400).json({ error: 'Falta la confirmación para actualizar la aplicación' })
  }
  if (estadoActualizaciones.aplicando) {
    return res.status(409).json({ error: 'Ya hay una actualización en curso' })
  }
  if (!aplicarHabilitado()) {
    return res.status(403).json({ error: 'La actualización automática no está habilitada en este servidor. Actualiza a mano con: git fetch && git merge --ff-only origin/main && cd taller-bicicletas && bash deploy/install.sh && systemctl restart taller' })
  }

  estadoActualizaciones.aplicando = true
  estadoActualizaciones.resultado = null
  estadoActualizaciones.ultimoError = null
  estadoActualizaciones.pasos = []
  estadoActualizaciones.log = []

  // La ejecución sigue en segundo plano; el estado se consulta con GET /.
  // Copia de seguridad antes de tocar nada y reinicio delegando en el gestor
  // de procesos (process.exit deja que systemd lo levante de nuevo).
  aplicarActualizacion({
    copiaSeguridad: () => crearBackup('auto'),
    reiniciar: () => setTimeout(() => process.exit(0), 1500),
  })
    .then((resultado) => {
      estadoActualizaciones.resultado = resultado
      estadoActualizaciones.aplicando = false
      if (!resultado.ok) estadoActualizaciones.ultimoError = resultado.error
    })
    .catch((error) => {
      estadoActualizaciones.aplicando = false
      estadoActualizaciones.ultimoError = error?.message || String(error)
    })

  return res.status(202).json({ ok: true, aplicando: true, mensaje: 'Actualización iniciada' })
})

export default router

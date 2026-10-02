import { Router } from 'express'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import prisma, { carpetaBackups, rutaBaseActiva } from '../db.js'
import { authMiddleware, roleMiddleware } from './auth.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = Router()

// Todas las rutas de copias de seguridad son exclusivas del rol admin
router.use(authMiddleware, roleMiddleware('admin'))

// Ruta a la base de datos SQLite. DATABASE_URL=file:./dev.db es relativo a prisma/,
// por lo que el fichero real está en <raíz>/prisma/dev.db.

// Carpeta donde se guardan las copias. DATA_DIR viene del .env (por defecto ./data)
// y se interpreta relativo al directorio de trabajo desde el que arranca el servidor.

// Número máximo de copias automáticas que se conservan
const MAX_BACKUPS_AUTO = 14

// Convierte un parámetro en un identificador entero positivo o devuelve null
function parseId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

// Devuelve la ruta absoluta y segura de un fichero de copia dentro de la carpeta
// de backups, neutralizando cualquier intento de path traversal con path.basename
function rutaBackup(filename) {
  return path.join(carpetaBackups(), path.basename(String(filename)))
}

// Comprueba si un fichero existe usando fs/promises
async function existeFichero(ruta) {
  try {
    await fs.access(ruta)
    return true
  } catch {
    return false
  }
}

// Borra las copias automáticas más antiguas conservando solo las MAX_BACKUPS_AUTO
// más recientes. Elimina tanto el fichero como su fila en la base de datos.
async function limpiarBackupsAutomaticos() {
  const antiguos = await prisma.backup.findMany({
    where: { tipo: 'auto' },
    orderBy: { createdAt: 'desc' },
    skip: MAX_BACKUPS_AUTO,
  })

  for (const backup of antiguos) {
    try {
      await fs.unlink(rutaBackup(backup.filename))
    } catch {
      // El fichero puede no existir; continuamos con el resto
    }
    await prisma.backup.delete({ where: { id: backup.id } })
  }
}

// Crea una copia de la base de datos copiando prisma/dev.db a la carpeta de backups
// y registra la fila correspondiente. `tipo` es 'manual' o 'auto'.
export async function crearBackup(tipo = 'manual') {
  await fs.mkdir(carpetaBackups(), { recursive: true })

  const filename = nombreBackup()
  const destino = path.join(carpetaBackups(), filename)
  await fs.copyFile(rutaBaseActiva(), destino)

  const { size } = await fs.stat(destino)
  return prisma.backup.create({ data: { filename, size, tipo } })
}

// Realiza una copia automática y limpia las antiguas. Exportada para reutilizarla
// desde server/index.js al programar las copias periódicas.
export async function ejecutarBackupAutomatico() {
  const backup = await crearBackup('auto')
  await limpiarBackupsAutomaticos()
  return backup
}

// Sincroniza la tabla Backup con los ficheros que realmente hay en carpetaBackups().
// Es necesario tras restaurar: la tabla pasa a ser la del fichero restaurado
// (más antiguo), por lo que se pierden las copias posteriores aunque sus
// ficheros sigan en disco. Hace dos cosas:
//   (a) borrar de la tabla las filas cuyo fichero ya no exista en disco;
//   (b) crear una fila por cada fichero backup-*.db sin fila registrada.
// `backupSeguridad` es la copia automática creada justo antes de restaurar y se
// registra con tipo 'auto'; el resto de ficheros sin fila se registran 'manual'.
async function sincronizarBackups(backupSeguridad) {
  const ficheros = (await fs.readdir(carpetaBackups())).filter((f) => /^backup-.*\.db$/.test(f))

  // (a) Borrar las filas cuyo fichero no exista en disco
  const filas = await prisma.backup.findMany()
  for (const fila of filas) {
    if (!ficheros.includes(path.basename(fila.filename))) {
      await prisma.backup.delete({ where: { id: fila.id } })
    }
  }

  // (b) Crear una fila por cada fichero que no esté registrado
  const registrados = new Set((await prisma.backup.findMany()).map((f) => f.filename))
  for (const filename of ficheros) {
    if (registrados.has(filename)) continue
    const { size, mtime } = await fs.stat(path.join(carpetaBackups(), filename))
    const tipo = backupSeguridad && filename === backupSeguridad.filename ? 'auto' : 'manual'
    await prisma.backup.create({
      data: { filename, size, tipo, createdAt: mtime },
    })
  }
}

// GET / -> listar copias de seguridad por fecha descendente
router.get('/', async (req, res, next) => {
  try {
    const backups = await prisma.backup.findMany({ orderBy: { createdAt: 'desc' } })
    return res.json(backups)
  } catch (error) {
    return next(error)
  }
})

// POST / -> crear una copia de seguridad manual
router.post('/', async (req, res, next) => {
  try {
    const backup = await crearBackup('manual')
    return res.status(201).json(backup)
  } catch (error) {
    return next(error)
  }
})

// GET /:id/descargar -> descargar el fichero de una copia de seguridad
router.get('/:id/descargar', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(400).json({ error: 'Identificador de copia no válido' })
    }

    const backup = await prisma.backup.findUnique({ where: { id } })
    if (!backup) {
      return res.status(404).json({ error: 'Copia de seguridad no encontrada' })
    }

    const ruta = rutaBackup(backup.filename)
    if (!(await existeFichero(ruta))) {
      return res.status(404).json({ error: 'El fichero de copia de seguridad no existe' })
    }

    return res.download(ruta, path.basename(backup.filename))
  } catch (error) {
    return next(error)
  }
})

// POST /:id/restaurar -> restaurar la base de datos desde una copia de seguridad
router.post('/:id/restaurar', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) {
      return res.status(400).json({ error: 'Identificador de copia no válido' })
    }

    const backup = await prisma.backup.findUnique({ where: { id } })
    if (!backup) {
      return res.status(404).json({ error: 'Copia de seguridad no encontrada' })
    }

    const ruta = rutaBackup(backup.filename)
    if (!(await existeFichero(ruta))) {
      return res.status(404).json({ error: 'El fichero de copia de seguridad no existe' })
    }

    // Copia automática de seguridad del estado actual antes de sobrescribir la base
    const seguridad = await crearBackup('auto')

    // Desconecta Prisma para liberar el fichero SQLite antes de reemplazarlo
    await prisma.$disconnect()
    await fs.copyFile(ruta, rutaBaseActiva())
    await prisma.$connect()

    // Al restaurar, la tabla Backup también se ha sustituido por la del fichero
    // restaurado (más antiguo), así que puede faltar información. Sincronizamos
    // la tabla con los ficheros que hay en disco para no perder ninguna copia.
    await sincronizarBackups(seguridad)

    return res.json({ success: true })
  } catch (error) {
    return next(error)
  }
})

export default router


// Genera el nombre de fichero de una copia con la marca de tiempo del momento:
// backup-YYYYMMDD-HHmmss.db
function nombreBackup() {
  const ahora = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const fecha = `${ahora.getFullYear()}${pad(ahora.getMonth() + 1)}${pad(ahora.getDate())}`
  const hora = `${pad(ahora.getHours())}${pad(ahora.getMinutes())}${pad(ahora.getSeconds())}`
  return `backup-${fecha}-${hora}.db`
}
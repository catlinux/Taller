import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

import authRoutes from './routes/auth.js'
import clientesRoutes from './routes/clientes.js'
import articulosRoutes from './routes/articulos.js'
import ordenesRoutes from './routes/ordenes.js'
import bicicletasRoutes from './routes/bicicletas.js'
import empresaRoutes from './routes/empresa.js'
import dashboardRoutes from './routes/dashboard.js'
import usuariosRoutes from './routes/usuarios.js'
import mecanicosRoutes from './routes/mecanicos.js'
import operacionesRoutes from './routes/operaciones.js'
import ajustesRoutes, { obtenerAjustes } from './routes/ajustes.js'
import modoRoutes from './routes/modo.js'
import actualizacionesRoutes from './routes/actualizaciones.js'
import papeleraRoutes from './routes/papelera.js'
import factusolRoutes from './routes/factusol.js'
import importarRoutes from './routes/importar.js'
import prisma from './db.js'
import backupsRoutes, { ejecutarBackupAutomatico } from './routes/backups.js'
import { cabecerasSeguridad } from './lib/seguridad.js'
import { migrarPagos } from './lib/pagos.js'
import { rellenarSinStock } from './lib/stock.js'
import { purgarAntiguas } from './lib/papelera.js'
import { ejecutarComprobacion } from './lib/actualizaciones.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001

// En producción vamos detrás del proxy inverso Apache (HTTPS), que envía
// X-Forwarded-For; confiar en él hace que req.ip sea la IP real del cliente.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1)
}
// Quita la cabecera X-Powered-By para no revelar el framework.
app.disable('x-powered-by')

// Cabeceras de seguridad para todas las respuestas.
app.use(cabecerasSeguridad)

// Middleware
if (process.env.NODE_ENV === 'production') {
  // En producción la web se sirve desde el mismo origen que la API, así que no
  // hace falta CORS; solo se permite si se configura un origen explícito.
  if (process.env.CORS_ORIGIN) {
    app.use(cors({ origin: process.env.CORS_ORIGIN }))
  }
} else {
  app.use(cors())
}
app.use(express.json({ limit: '10mb' }))

// Rutas API
app.use('/api/auth', authRoutes)
app.use('/api/clientes', clientesRoutes)
app.use('/api/articulos', articulosRoutes)
app.use('/api/ordenes', ordenesRoutes)
app.use('/api/bicicletas', bicicletasRoutes)
app.use('/api/empresa', empresaRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/usuarios', usuariosRoutes)
app.use('/api/mecanicos', mecanicosRoutes)
app.use('/api/operaciones', operacionesRoutes)
app.use('/api/ajustes', ajustesRoutes)
app.use('/api/backups', backupsRoutes)
app.use('/api/modo', modoRoutes)
app.use('/api/actualizaciones', actualizacionesRoutes)
app.use('/api/papelera', papeleraRoutes)
app.use('/api/factusol', factusolRoutes)
app.use('/api/importar', importarRoutes)

// Servir archivos estáticos en producción
if (process.env.NODE_ENV === 'production') {
  // El navegador debe revalidar siempre la página y el service worker para
  // enterarse de las versiones nuevas; los ficheros con hash (assets/) se
  // pueden cachear para siempre.
  const sinCache = (res) => res.setHeader('Cache-Control', 'no-cache')
  app.use(express.static(join(__dirname, '../dist'), {
    setHeaders: (res, ruta) => {
      if (/[\\/]assets[\\/]/.test(ruta)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      else sinCache(res)
    },
  }))
  app.get('*', (req, res) => {
    sinCache(res)
    res.sendFile(join(__dirname, '../dist/index.html'))
  })
}

// Manejo de errores
app.use((err, req, res, next) => {
  console.error('Error:', err)
  res.status(err.status || 500).json({
    error: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  })
})

app.listen(PORT, () => {
  console.log(`\n🚲 Servidor del taller corriendo en http://localhost:${PORT}`)
  console.log(`📊 API disponible en http://localhost:${PORT}/api`)
})

// Unifica las antiguas formas/estados de pago en el campo formaPago (idempotente).
migrarPagos(prisma).catch((error) => {
  console.error('Error al migrar las formas de pago:', error)
})

// Rellena la fecha desde la que están sin stock los artículos existentes (idempotente).
rellenarSinStock(prisma).catch((error) => {
  console.error('Error al rellenar la fecha sin stock de los artículos:', error)
})

// Las órdenes terminadas antes de existir fechaFinalizacion toman su última
// modificación, para que la fecha del albarán de Factusol no cambie al
// marcarlas como exportadas (idempotente).
prisma.$executeRaw`UPDATE OrdenReparacion SET fechaFinalizacion = updatedAt WHERE fechaFinalizacion IS NULL AND estado IN ('Finalizada', 'Entregada')`.catch((error) => {
  console.error('Error al rellenar la fecha de finalización de las órdenes:', error)
})

// Poda la papelera: borra definitivamente lo que lleve más de 30 días archivado.
// Se ejecuta al arrancar y luego cada 24 horas.
purgarAntiguas(prisma).catch((error) => {
  console.error('Error al purgar la papelera:', error)
})
setInterval(() => {
  purgarAntiguas(prisma).catch((error) => {
    console.error('Error al purgar la papelera:', error)
  })
}, 24 * 60 * 60 * 1000).unref()

// Copia de seguridad automática: una al arrancar y luego cada 24 horas.
const INTERVALO_BACKUP_MS = 24 * 60 * 60 * 1000
const programarBackupAutomatico = () => {
  ejecutarBackupAutomatico().catch((error) => {
    console.error('Error al crear la copia de seguridad automática:', error)
  })
}
programarBackupAutomatico()
setInterval(programarBackupAutomatico, INTERVALO_BACKUP_MS).unref()

// Comprobación periódica de actualizaciones: solo comprueba y avisa (git fetch y
// comparación), nunca aplica nada. Se hace una 60 s después de arrancar y luego
// cada `actualizacionesHoras` horas (por defecto 6). El ajuste se relee en cada
// ciclo para que los cambios en Configuración surtan efecto sin reiniciar.
const RETRASO_COMPROBACION_MS = 60 * 1000
const HORAS_COMPROBACION_DEFECTO = 6

async function comprobarActualizacionesProgramada() {
  try {
    const { actualizacionesActivas, actualizacionesHoras } = await obtenerAjustes()
    if (actualizacionesActivas === true) {
      await ejecutarComprobacion()
    }
    const horas = Number(actualizacionesHoras)
    return (horas >= 1 ? horas : HORAS_COMPROBACION_DEFECTO) * 60 * 60 * 1000
  } catch (error) {
    console.error('Error al comprobar actualizaciones:', error?.message || error)
    return HORAS_COMPROBACION_DEFECTO * 60 * 60 * 1000
  }
}

function programarComprobacionActualizaciones(demora) {
  const temporizador = setTimeout(async () => {
    const siguiente = await comprobarActualizacionesProgramada()
    programarComprobacionActualizaciones(siguiente)
  }, demora)
  if (typeof temporizador.unref === 'function') temporizador.unref()
}

programarComprobacionActualizaciones(RETRASO_COMPROBACION_MS)

// Aviso al arrancar si algún usuario conserva la contraseña de ejemplo del seed.
const CONTRASENAS_EJEMPLO = { admin: 'admin123', mecanico: 'mecanico123' }
async function avisarContrasenasPorDefecto() {
  for (const [username, password] of Object.entries(CONTRASENAS_EJEMPLO)) {
    const usuario = await prisma.usuario.findUnique({ where: { username } })
    if (usuario && (await bcrypt.compare(password, usuario.password))) {
      console.warn(`⚠️  El usuario "${username}" sigue con la contraseña de ejemplo: cámbiala en Configuración › Usuarios.`)
    }
  }
}
avisarContrasenasPorDefecto().catch(() => {})

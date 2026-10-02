import express from 'express'
import cors from 'cors'
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
import ajustesRoutes from './routes/ajustes.js'
import modoRoutes from './routes/modo.js'
import backupsRoutes, { ejecutarBackupAutomatico } from './routes/backups.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors())
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

// Servir archivos estáticos en producción
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, '../dist')))
  app.get('*', (req, res) => {
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

// Copia de seguridad automática: una al arrancar y luego cada 24 horas.
const INTERVALO_BACKUP_MS = 24 * 60 * 60 * 1000
const programarBackupAutomatico = () => {
  ejecutarBackupAutomatico().catch((error) => {
    console.error('Error al crear la copia de seguridad automática:', error)
  })
}
programarBackupAutomatico()
setInterval(programarBackupAutomatico, INTERVALO_BACKUP_MS).unref()

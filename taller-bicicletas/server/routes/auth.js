import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import prisma from '../db.js'
import { obtenerAjustes } from './ajustes.js'
import { crearLimitadorLogin } from '../lib/seguridad.js'

const router = Router()

// Limita los intentos fallidos de login por IP (10 fallos / 15 minutos).
const limitadorLogin = crearLimitadorLogin()
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('Falta JWT_SECRET en el entorno: es obligatorio en producción (ver .env.example)')
}
const tokenSecret = process.env.JWT_SECRET || 'taller-bicicletas-development-secret'
const publicUser = ({ id, username, nombre, rol, activo, pinHash }) => ({
  id,
  username,
  nombre,
  rol,
  activo,
  tienePin: Boolean(pinHash),
})

router.post('/login', limitadorLogin, async (req, res, next) => {
  try {
    const { username, password } = req.body ?? {}
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' })
    }

    const user = await prisma.usuario.findUnique({ where: { username } })
    if (!user || !user.activo || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' })
    }

    // Un inicio de sesión correcto con contraseña reinicia los contadores del PIN.
    if (user.pinIntentos !== 0 || user.pinBloqueadoHasta) {
      await prisma.usuario.update({
        where: { id: user.id },
        data: { pinIntentos: 0, pinBloqueadoHasta: null },
      })
      user.pinIntentos = 0
      user.pinBloqueadoHasta = null
    }

    // La duración del token depende del ajuste sesionHoras (por defecto 8).
    const { sesionHoras } = await obtenerAjustes()
    const token = jwt.sign(
      { sub: String(user.id), username: user.username, rol: user.rol },
      tokenSecret,
      { expiresIn: `${sesionHoras}h` },
    )
    const { exp } = jwt.decode(token)
    const expiraEn = new Date(exp * 1000).toISOString()

    return res.json({ token, expiraEn, user: publicUser(user) })
  } catch (error) {
    return next(error)
  }
})

// Solo un administrador puede dar de alta usuarios (antes era público)
router.post('/register', authMiddleware, roleMiddleware('admin'), async (req, res, next) => {
  try {
    const { username, password, nombre } = req.body ?? {}
    if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || password.length < 8 || typeof nombre !== 'string' || !nombre.trim()) {
      return res.status(400).json({ error: 'Nombre y usuario son obligatorios; la contraseña debe tener al menos 8 caracteres' })
    }

    const existingUser = await prisma.usuario.findUnique({ where: { username: username.trim() } })
    if (existingUser) {
      return res.status(409).json({ error: 'El nombre de usuario ya está en uso' })
    }

    const user = await prisma.usuario.create({
      data: {
        username: username.trim(),
        password: await bcrypt.hash(password, 10),
        nombre: nombre.trim(),
        rol: 'mecanico',
      },
    })
    return res.status(201).json({ user: publicUser(user) })
  } catch (error) {
    return next(error)
  }
})

export async function authMiddleware(req, res, next) {
  const authorization = req.headers.authorization
  const [scheme, token] = authorization?.split(' ') ?? []
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Autenticación requerida' })
  }

  try {
    const payload = jwt.verify(token, tokenSecret)
    const userId = Number(payload.sub)
    if (!Number.isInteger(userId)) {
      return res.status(401).json({ error: 'Token no válido' })
    }
    const user = await prisma.usuario.findUnique({ where: { id: userId } })
    if (!user || !user.activo) {
      return res.status(401).json({ error: 'Usuario no disponible' })
    }
    req.user = publicUser(user)
    return next()
  } catch {
    return res.status(401).json({ error: 'Token no válido o caducado' })
  }
}

export function roleMiddleware(roles) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles]
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No tienes permisos para realizar esta acción' })
    }
    return next()
  }
}

router.get('/me', authMiddleware, (req, res) => res.json({ user: req.user }))

const PIN_REGEX = /^\d{4,6}$/
const MAX_INTENTOS_PIN = 5
const BLOQUEO_PIN_MS = 15 * 60 * 1000

// Crea o cambia el PIN del usuario autenticado. Exige la contraseña actual.
router.put('/pin', authMiddleware, async (req, res, next) => {
  try {
    const { pin, password } = req.body ?? {}
    if (typeof pin !== 'string' || !PIN_REGEX.test(pin)) {
      return res.status(400).json({ error: 'El PIN debe tener entre 4 y 6 dígitos' })
    }
    if (typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'La contraseña actual es obligatoria' })
    }

    const user = await prisma.usuario.findUnique({ where: { id: req.user.id } })
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'La contraseña actual no es correcta' })
    }

    await prisma.usuario.update({
      where: { id: user.id },
      data: {
        pinHash: await bcrypt.hash(pin, 10),
        pinIntentos: 0,
        pinBloqueadoHasta: null,
      },
    })
    return res.json({ ok: true, tienePin: true })
  } catch (error) {
    return next(error)
  }
})

// Elimina el PIN del usuario autenticado. Exige la contraseña actual.
router.delete('/pin', authMiddleware, async (req, res, next) => {
  try {
    const { password } = req.body ?? {}
    if (typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'La contraseña actual es obligatoria' })
    }

    const user = await prisma.usuario.findUnique({ where: { id: req.user.id } })
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'La contraseña actual no es correcta' })
    }

    await prisma.usuario.update({
      where: { id: user.id },
      data: { pinHash: null, pinIntentos: 0, pinBloqueadoHasta: null },
    })
    return res.json({ ok: true, tienePin: false })
  } catch (error) {
    return next(error)
  }
})

// Desbloquea la sesión con el PIN. Tras 5 fallos bloquea 15 minutos.
router.post('/desbloquear', authMiddleware, async (req, res, next) => {
  try {
    const { pin } = req.body ?? {}

    const user = await prisma.usuario.findUnique({ where: { id: req.user.id } })
    if (!user || !user.pinHash) {
      return res.status(400).json({ error: 'El usuario no tiene un PIN configurado' })
    }

    const ahora = new Date()
    if (user.pinBloqueadoHasta && user.pinBloqueadoHasta > ahora) {
      return res.status(423).json({
        error: 'Demasiados intentos. Vuelve a iniciar sesión con tu contraseña.',
        cerrarSesion: true,
      })
    }

    // Si el bloqueo temporal ya expiró, se parte de cero intentos.
    let pinIntentos = user.pinBloqueadoHasta ? 0 : user.pinIntentos

    if (typeof pin === 'string' && (await bcrypt.compare(pin, user.pinHash))) {
      await prisma.usuario.update({
        where: { id: user.id },
        data: { pinIntentos: 0, pinBloqueadoHasta: null },
      })
      return res.json({ ok: true })
    }

    pinIntentos += 1
    if (pinIntentos >= MAX_INTENTOS_PIN) {
      await prisma.usuario.update({
        where: { id: user.id },
        data: {
          pinIntentos,
          pinBloqueadoHasta: new Date(Date.now() + BLOQUEO_PIN_MS),
        },
      })
      return res.status(423).json({
        error: 'Demasiados intentos. Vuelve a iniciar sesión con tu contraseña.',
        cerrarSesion: true,
      })
    }

    await prisma.usuario.update({
      where: { id: user.id },
      data: { pinIntentos },
    })
    return res.status(401).json({
      error: 'PIN incorrecto',
      intentosRestantes: MAX_INTENTOS_PIN - pinIntentos,
    })
  } catch (error) {
    return next(error)
  }
})

export default router

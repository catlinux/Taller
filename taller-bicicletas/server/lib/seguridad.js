// Endurecimiento del servidor de producción: cabeceras de seguridad y un
// limitador de intentos de login en memoria. Sin dependencias externas.

// Cabeceras de seguridad para todas las respuestas. En producción se añade HSTS
// porque el acceso real es por HTTPS a través del proxy Apache.
export function cabecerasSeguridad(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000')
  }
  return next()
}

export const MAX_INTENTOS_LOGIN = 10
export const VENTANA_LOGIN_MS = 15 * 60 * 1000
const LIMPIEZA_LOGIN_MS = 5 * 60 * 1000

// Crea un middleware que limita los intentos fallidos de login por IP: como
// máximo `maxIntentos` fallos (401) dentro de `ventanaMs`. Al superarlo responde
// 429 con Retry-After. Un login correcto reinicia el contador de esa IP.
// `ahora` permite inyectar un reloj falso en las pruebas.
export function crearLimitadorLogin({
  maxIntentos = MAX_INTENTOS_LOGIN,
  ventanaMs = VENTANA_LOGIN_MS,
  ahora = Date.now,
  limpiezaMs = LIMPIEZA_LOGIN_MS,
} = {}) {
  // ip -> { cuenta, primera }, donde `primera` es el inicio de la ventana.
  const intentos = new Map()

  // Elimina las entradas cuya ventana ya ha caducado.
  const limpiar = () => {
    const limite = ahora() - ventanaMs
    for (const [ip, entrada] of intentos) {
      if (entrada.primera <= limite) intentos.delete(ip)
    }
  }
  const temporizador = setInterval(limpiar, limpiezaMs)
  if (typeof temporizador.unref === 'function') temporizador.unref()

  const middleware = (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'desconocida'
    const t = ahora()

    // Descarta una ventana caducada antes de comprobar el límite.
    const previa = intentos.get(ip)
    if (previa && previa.primera <= t - ventanaMs) intentos.delete(ip)

    const entrada = intentos.get(ip)
    if (entrada && entrada.cuenta >= maxIntentos) {
      const restante = Math.ceil((entrada.primera + ventanaMs - t) / 1000)
      res.setHeader('Retry-After', String(Math.max(restante, 1)))
      return res.status(429).json({ error: 'Demasiados intentos. Inténtalo de nuevo en unos minutos.' })
    }

    // Registra el resultado real de la petición cuando la respuesta termina:
    // un 401 suma un fallo; una respuesta correcta reinicia el contador.
    res.on('finish', () => {
      if (res.statusCode === 401) {
        const actual = intentos.get(ip)
        if (actual && actual.primera > t - ventanaMs) actual.cuenta += 1
        else intentos.set(ip, { cuenta: 1, primera: t })
      } else if (res.statusCode < 400) {
        intentos.delete(ip)
      }
    })

    return next()
  }

  // Permite detener la limpieza periódica (útil en pruebas).
  middleware.detener = () => clearInterval(temporizador)
  return middleware
}

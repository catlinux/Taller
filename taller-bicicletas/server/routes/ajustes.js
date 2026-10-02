import { Router } from 'express'
import prisma from '../db.js'
import { authMiddleware, roleMiddleware } from './auth.js'

const router = Router()
router.use(authMiddleware)

// Definición de los ajustes de la aplicación: valor por defecto y validación.
// Cada ajuste se guarda en la tabla Ajuste como un par clave/valor, con el
// valor serializado en JSON (texto).
const CLAUSULA_RGPD_DEFECTO =
  'Sus datos personales se tratan conforme al Reglamento (UE) 2016/679 (RGPD) para gestionar la reparación. Puede ejercer sus derechos dirigiéndose a {empresa} ({email}).'

export const AJUSTES_DEFECTO = {
  filasPorPagina: 50,
  colorAcento: 'azul',
  densidad: 'comoda',
  radioEsquinas: 'normal',
  introActivada: true,
  precioHora: 30,
  ivaDefecto: 21,
  diasValidezPresupuesto: 15,
  clausulaRgpd: CLAUSULA_RGPD_DEFECTO,
  sesionHoras: 8,
  pinActivado: false,
  pinMinutosInactividad: 5,
  bloqueoInactividadMinutos: 0,
}

// Reglas de validación por clave. tipo: 'opcion' (lista de valores permitidos),
// 'booleano', 'texto' o 'numero' (con min/max opcionales).
const VALIDADORES = {
  filasPorPagina: { tipo: 'opcion', opciones: [25, 50, 100] },
  colorAcento: { tipo: 'opcion', opciones: ['azul', 'naranja', 'verde', 'violeta', 'rosa'] },
  densidad: { tipo: 'opcion', opciones: ['comoda', 'compacta'] },
  radioEsquinas: { tipo: 'opcion', opciones: ['normal', 'redondeado', 'recto'] },
  introActivada: { tipo: 'booleano' },
  precioHora: { tipo: 'numero', min: 0 },
  ivaDefecto: { tipo: 'numero', min: 0, max: 100 },
  diasValidezPresupuesto: { tipo: 'numero', min: 0 },
  clausulaRgpd: { tipo: 'texto' },
  sesionHoras: { tipo: 'numero', min: 1, max: 24 },
  pinActivado: { tipo: 'booleano' },
  pinMinutosInactividad: { tipo: 'numero', min: 1, max: 120 },
  bloqueoInactividadMinutos: { tipo: 'numero', min: 0, max: 240 },
}

// Valida un valor concreto para una clave conocida. Devuelve { valor } con el
// valor normalizado o { error } con el motivo del rechazo.
function validarValor(clave, valor) {
  const regla = VALIDADORES[clave]
  if (!regla) return { error: `Ajuste desconocido: ${clave}` }

  if (regla.tipo === 'opcion') {
    if (!regla.opciones.includes(valor)) {
      return { error: `El ajuste ${clave} solo admite: ${regla.opciones.join(', ')}` }
    }
    return { valor }
  }

  if (regla.tipo === 'booleano') {
    if (typeof valor !== 'boolean') return { error: `El ajuste ${clave} debe ser un valor booleano` }
    return { valor }
  }

  if (regla.tipo === 'texto') {
    if (typeof valor !== 'string') return { error: `El ajuste ${clave} debe ser una cadena de texto` }
    return { valor }
  }

  // tipo 'numero'
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    return { error: `El ajuste ${clave} debe ser un número válido` }
  }
  if (regla.min !== undefined && valor < regla.min) {
    return { error: `El ajuste ${clave} debe ser mayor o igual que ${regla.min}` }
  }
  if (regla.max !== undefined && valor > regla.max) {
    return { error: `El ajuste ${clave} debe ser menor o igual que ${regla.max}` }
  }
  return { valor }
}

// Lee todos los ajustes guardados y devuelve el objeto completo mezclando los
// valores por defecto con los guardados (los guardados tienen prioridad).
export async function obtenerAjustes() {
  const filas = await prisma.ajuste.findMany()
  const ajustes = { ...AJUSTES_DEFECTO }
  for (const { clave, valor } of filas) {
    if (clave in AJUSTES_DEFECTO) {
      try {
        ajustes[clave] = JSON.parse(valor)
      } catch {
        // Valor corrupto: se conserva el valor por defecto.
      }
    }
  }
  return ajustes
}

// GET / -> objeto completo de ajustes
router.get('/', async (req, res, next) => {
  try {
    return res.json(await obtenerAjustes())
  } catch (error) { return next(error) }
})

// PUT / -> acepta un objeto parcial de ajustes, valida cada clave conocida y
// guarda las que se hayan indicado. Devuelve el objeto completo actualizado.
router.put('/', roleMiddleware('admin'), async (req, res, next) => {
  try {
    const body = req.body ?? {}
    if (typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Los ajustes deben enviarse como un objeto' })
    }

    const claves = Object.keys(body)
    if (claves.length === 0) {
      return res.status(400).json({ error: 'No se han proporcionado ajustes para actualizar' })
    }

    const validados = {}
    for (const clave of claves) {
      if (!(clave in AJUSTES_DEFECTO)) {
        return res.status(400).json({ error: `Ajuste desconocido: ${clave}` })
      }
      const { valor, error } = validarValor(clave, body[clave])
      if (error) return res.status(400).json({ error })
      validados[clave] = valor
    }

    await prisma.$transaction(
      Object.entries(validados).map(([clave, valor]) =>
        prisma.ajuste.upsert({
          where: { clave },
          update: { valor: JSON.stringify(valor) },
          create: { clave, valor: JSON.stringify(valor) },
        }),
      ),
    )

    return res.json(await obtenerAjustes())
  } catch (error) { return next(error) }
})

export default router

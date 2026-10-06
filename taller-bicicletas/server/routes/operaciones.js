import { Router } from 'express'
import prisma from '../db.js'
import { authMiddleware, roleMiddleware } from './auth.js'
import { guardarEnPapelera, descripcionOperacion } from '../lib/papelera.js'
import { coincideTexto } from '../lib/texto.js'

const router = Router()
router.use(authMiddleware)

function parseId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

function numeroNoNegativo(value) {
  if (value === null || value === '' || typeof value === 'boolean' || Array.isArray(value) || typeof value === 'object') return null
  const parsed = typeof value === 'string' ? Number(value.trim()) : Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function construirDatos(body, parcial = false) {
  const datos = {}
  for (const campo of ['codigo', 'descripcion']) {
    if (body[campo] !== undefined || !parcial) {
      if (typeof body[campo] !== 'string' || !body[campo].trim()) return { error: `El campo ${campo} es obligatorio y debe ser una cadena de texto` }
      datos[campo] = body[campo].trim()
    }
  }
  for (const campo of ['tiempoDefecto', 'precioHoraDefecto']) {
    if (body[campo] !== undefined) {
      const valor = numeroNoNegativo(body[campo])
      if (valor === null) return { error: `El campo ${campo} debe ser un número válido mayor o igual que 0` }
      datos[campo] = valor
    }
  }
  if (body.activo !== undefined) {
    if (typeof body.activo !== 'boolean') return { error: 'El campo activo debe ser booleano' }
    datos.activo = body.activo
  }
  // Categoría opcional (texto o null).
  if (body.categoria !== undefined) {
    if (body.categoria === null) datos.categoria = null
    else if (typeof body.categoria === 'string') datos.categoria = body.categoria.trim() || null
    else return { error: 'El campo categoria debe ser una cadena de texto o null' }
  }
  // Tiempos alternativos en minutos (array de enteros, como máximo 5). Si se envían
  // y no se indica tiempoDefecto, este pasa a ser el primer tiempo en horas.
  if (body.tiempos !== undefined) {
    if (body.tiempos === null) {
      datos.tiempos = null
    } else {
      if (!Array.isArray(body.tiempos)) return { error: 'El campo tiempos debe ser un array de minutos' }
      if (body.tiempos.length > 5) return { error: 'El campo tiempos admite como máximo 5 valores' }
      for (const valor of body.tiempos) {
        if (!Number.isInteger(valor) || valor < 1 || valor > 1440) {
          return { error: 'Los tiempos deben ser minutos enteros entre 1 y 1440' }
        }
      }
      datos.tiempos = body.tiempos.length > 0 ? JSON.stringify(body.tiempos) : null
      if (body.tiempos.length > 0 && body.tiempoDefecto === undefined) {
        datos.tiempoDefecto = Number((body.tiempos[0] / 60).toFixed(4))
      }
    }
  }
  return { datos }
}

function esDuplicado(error) { return error?.code === 'P2002' }

// Convierte el campo tiempos (JSON) en un array de minutos; [] si no hay o es inválido.
function parsearTiempos(valor) {
  if (typeof valor !== 'string' || valor.trim() === '') return []
  try {
    const lista = JSON.parse(valor)
    return Array.isArray(lista) ? lista.filter((n) => Number.isInteger(n)) : []
  } catch {
    return []
  }
}

// Prepara una operación para la API: tiempos como array en lugar del JSON guardado.
function conTiempos(operacion) {
  return { ...operacion, tiempos: parsearTiempos(operacion.tiempos) }
}

// Ordena por categoría (las nulas al final), orden de catálogo e id.
function ordenarOperaciones(operaciones) {
  return [...operaciones].sort((a, b) => {
    const categoriaA = a.categoria ?? null
    const categoriaB = b.categoria ?? null
    if (categoriaA === null && categoriaB !== null) return 1
    if (categoriaA !== null && categoriaB === null) return -1
    if (categoriaA !== null && categoriaB !== null && categoriaA !== categoriaB) {
      return categoriaA.localeCompare(categoriaB, 'es')
    }
    if (a.ordenCatalogo !== b.ordenCatalogo) return a.ordenCatalogo - b.ordenCatalogo
    return a.id - b.id
  })
}

router.get('/', async (req, res, next) => {
  try {
    const where = {}
    if (req.query.todas !== '1') where.activo = true
    const operaciones = await prisma.operacionManoObra.findMany({ where, orderBy: { id: 'asc' } })
    const preparadas = ordenarOperaciones(operaciones.map(conTiempos))

    // Búsqueda por ?q= en código, descripción o categoría, ignorando mayúsculas y
    // acentos (se resuelve en memoria, porque SQLite no ignora los diacríticos).
    const q = req.query.q !== undefined ? String(req.query.q).trim() : ''
    if (q === '') return res.json(preparadas)

    return res.json(preparadas.filter((operacion) => coincideTexto([operacion.codigo, operacion.descripcion, operacion.categoria], q)))
  } catch (error) { return next(error) }
})

router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) return res.status(400).json({ error: 'Identificador de operación no válido' })
    const operacion = await prisma.operacionManoObra.findUnique({ where: { id } })
    if (!operacion) return res.status(404).json({ error: 'Operación no encontrada' })
    return res.json(operacion)
  } catch (error) { return next(error) }
})

router.post('/', roleMiddleware('admin'), async (req, res, next) => {
  try {
    const { datos, error } = construirDatos(req.body ?? {})
    if (error) return res.status(400).json({ error })
    const existente = await prisma.operacionManoObra.findUnique({ where: { codigo: datos.codigo } })
    if (existente) return res.status(409).json({ error: 'Ya existe una operación con ese código' })
    try {
      const operacion = await prisma.operacionManoObra.create({ data: datos })
      return res.status(201).json(operacion)
    } catch (error) {
      if (esDuplicado(error)) return res.status(409).json({ error: 'Ya existe una operación con ese código' })
      throw error
    }
  } catch (error) { return next(error) }
})

router.put('/:id', roleMiddleware('admin'), async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) return res.status(400).json({ error: 'Identificador de operación no válido' })
    const existente = await prisma.operacionManoObra.findUnique({ where: { id } })
    if (!existente) return res.status(404).json({ error: 'Operación no encontrada' })
    const { datos, error } = construirDatos(req.body ?? {}, true)
    if (error) return res.status(400).json({ error })
    if (Object.keys(datos).length === 0) return res.status(400).json({ error: 'No se han proporcionado campos para actualizar' })
    if (datos.codigo !== undefined && datos.codigo !== existente.codigo) {
      const duplicado = await prisma.operacionManoObra.findUnique({ where: { codigo: datos.codigo } })
      if (duplicado) return res.status(409).json({ error: 'Ya existe una operación con ese código' })
    }
    try {
      const operacion = await prisma.operacionManoObra.update({ where: { id }, data: datos })
      return res.json(operacion)
    } catch (error) {
      if (esDuplicado(error)) return res.status(409).json({ error: 'Ya existe una operación con ese código' })
      throw error
    }
  } catch (error) { return next(error) }
})

router.delete('/:id', roleMiddleware('admin'), async (req, res, next) => {
  try {
    const id = parseId(req.params.id)
    if (id === null) return res.status(400).json({ error: 'Identificador de operación no válido' })
    const existente = await prisma.operacionManoObra.findUnique({ where: { id } })
    if (!existente) return res.status(404).json({ error: 'Operación no encontrada' })
    const usuario = req.user?.nombre ?? req.user?.username ?? null
    const { id: papeleraId } = await prisma.$transaction(async (tx) => {
      const creada = await guardarEnPapelera(tx, {
        tipo: 'operacion',
        descripcion: descripcionOperacion(existente),
        datos: { operacion: existente },
        usuario,
      })
      await tx.operacionManoObra.delete({ where: { id } })
      return creada
    })
    return res.json({ success: true, papeleraId })
  } catch (error) { return next(error) }
})

export default router

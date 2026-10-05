import { Router } from 'express'
import prisma from '../db.js'
import { authMiddleware, roleMiddleware } from './auth.js'
import {
  CABECERAS_ALB,
  CABECERAS_LAL,
  normalizarConfig,
  numeroAlbaran,
  prepararExportacion,
  generarLibro,
} from '../lib/factusol.js'
import { rangoFechas, validarOrdenIds } from '../lib/factusolRango.js'

const router = Router()

// Todas las rutas de Factusol son exclusivas del rol admin
router.use(authMiddleware, roleMiddleware('admin'))

// Clave de la tabla Ajuste donde se guarda la configuración de Factusol.
const CLAVE_AJUSTE = 'factusol'

// Valores por defecto de la configuración, para mostrarlos antes de guardar nada.
const CONFIG_DEFECTO = {
  serie: null,
  almacen: 'GEN',
  formaPago: '',
  articuloManoObra: '',
  tiposIva: [21, 10, 4],
  clienteGenerico: null,
}

// Estados de orden que se pueden facturar (el resto no se exporta).
const ESTADOS_FACTURABLES = ['Finalizada', 'Entregada']

// Include común de las órdenes: todo lo que necesita prepararExportacion para
// construir las filas, más el precio de compra del artículo (coste en LAL).
const INCLUDE_ORDEN = {
  cliente: true,
  bicicleta: true,
  materiales: { include: { articulo: { select: { precioCompra: true } } } },
  manoObra: true,
}

// Lee la configuración guardada en Ajuste y la mezcla con los valores por
// defecto. `configurada` indica si la serie es válida (1-9).
async function leerConfig() {
  const ajuste = await prisma.ajuste.findUnique({ where: { clave: CLAVE_AJUSTE } })
  let guardada = {}
  if (ajuste) {
    try {
      guardada = JSON.parse(ajuste.valor) ?? {}
    } catch {
      // Valor corrupto: se usan los valores por defecto.
    }
  }
  const mezclada = { ...CONFIG_DEFECTO, ...guardada }
  // Si es válida se usa ya normalizada; si no (sin serie), tal cual para mostrarla.
  const normalizada = normalizarConfig(mezclada)
  if (normalizada.error) return { config: mezclada, configurada: false }
  return { config: normalizada.config, configurada: true }
}

// Interpreta un flag booleano que puede llegar como 1, true o sus formas en texto.
function esSi(valor) {
  return valor === true || valor === 1 || valor === '1' || valor === 'true'
}

// Fecha efectiva de una orden: la de finalización y, si no hay, la última
// modificación (misma regla que usa la exportación).
function fechaEfectiva(orden) {
  return orden.fechaFinalizacion || orden.updatedAt
}

// Nombre y apellidos del cliente en una sola cadena.
function nombreCliente(cliente) {
  if (!cliente) return null
  const texto = [cliente.nombre, cliente.apellidos]
    .filter((parte) => parte !== null && parte !== undefined && String(parte).trim() !== '')
    .join(' ')
  return texto || null
}

// Añade a cada elemento de incluidas/bloqueadas el cliente, la fecha efectiva y
// la marca de exportación, para poder mostrarlos en la interfaz.
function anotar(lista, ordenes) {
  const porId = new Map(ordenes.map((orden) => [orden.id, orden]))
  return lista.map((item) => {
    const orden = porId.get(item.ordenId)
    return {
      ...item,
      cliente: nombreCliente(orden?.cliente),
      fecha: fechaEfectiva(orden),
      exportadaFactusolEn: orden?.exportadaFactusolEn ?? null,
    }
  })
}

// Carga las órdenes finalizadas o entregadas cuya fecha efectiva cae dentro del
// rango, ambos días incluidos. El rango viene en hora local (ver rangoFechas).
async function cargarOrdenes(desde, hasta) {
  return prisma.ordenReparacion.findMany({
    where: {
      estado: { in: ESTADOS_FACTURABLES },
      OR: [
        { fechaFinalizacion: { gte: desde, lte: hasta } },
        { fechaFinalizacion: null, updatedAt: { gte: desde, lte: hasta } },
      ],
    },
    include: INCLUDE_ORDEN,
    orderBy: { numeroOrden: 'asc' },
  })
}

// GET /config -> configuración guardada mezclada con los valores por defecto,
// más configurada: true/false según la serie sea válida.
router.get('/config', async (req, res, next) => {
  try {
    const { config, configurada } = await leerConfig()
    return res.json({ ...config, configurada })
  } catch (error) {
    return next(error)
  }
})

// PUT /config -> valida la configuración con normalizarConfig y la guarda.
router.put('/config', async (req, res, next) => {
  try {
    const { config, error } = normalizarConfig(req.body ?? {})
    if (error) {
      return res.status(400).json({ error })
    }

    const valor = JSON.stringify(config)
    await prisma.ajuste.upsert({
      where: { clave: CLAVE_AJUSTE },
      update: { valor },
      create: { clave: CLAVE_AJUSTE, valor },
    })

    return res.json({ ...config, configurada: true })
  } catch (error) {
    return next(error)
  }
})

// GET /previsualizar?desde=&hasta=&incluirExportadas=1 -> órdenes incluidas y
// bloqueadas de un rango, sin generar ningún fichero ni marcar nada.
router.get('/previsualizar', async (req, res, next) => {
  try {
    const { config, configurada } = await leerConfig()
    if (!configurada) {
      return res.status(400).json({ error: 'Configura antes la serie de Factusol' })
    }

    const rango = rangoFechas(req.query.desde, req.query.hasta)
    if (rango.error) {
      return res.status(400).json({ error: rango.error })
    }

    const incluirExportadas = esSi(req.query.incluirExportadas)
    const ordenes = await cargarOrdenes(rango.desde, rango.hasta)
    const { incluidas, bloqueadas } = prepararExportacion(ordenes, config, { incluirExportadas })

    return res.json({
      config,
      incluidas: anotar(incluidas, ordenes),
      bloqueadas: anotar(bloqueadas, ordenes),
    })
  } catch (error) {
    return next(error)
  }
})

// POST /ficheros { desde, hasta, incluirExportadas, ordenIds } -> genera los
// ficheros ALB y LAL (en base64) de las órdenes indicadas. No marca nada.
router.post('/ficheros', async (req, res, next) => {
  try {
    const { config, configurada } = await leerConfig()
    if (!configurada) {
      return res.status(400).json({ error: 'Configura antes la serie de Factusol' })
    }

    const body = req.body ?? {}
    const rango = rangoFechas(body.desde, body.hasta)
    if (rango.error) {
      return res.status(400).json({ error: rango.error })
    }

    const { ordenIds, error } = validarOrdenIds(body.ordenIds)
    if (error) {
      return res.status(400).json({ error })
    }

    const incluirExportadas = esSi(body.incluirExportadas)
    const ordenes = await cargarOrdenes(rango.desde, rango.hasta)
    const { incluidas } = prepararExportacion(ordenes, config, { incluirExportadas })

    // Solo se pueden generar ficheros de órdenes que estén entre las incluidas.
    const incluidasIds = new Set(incluidas.map((item) => item.ordenId))
    const faltan = ordenIds.filter((id) => !incluidasIds.has(id))
    if (faltan.length > 0) {
      return res.status(400).json({
        error: `Estas órdenes no están entre las incluidas: ${faltan.join(', ')}`,
      })
    }

    const solicitadas = new Set(ordenIds)
    const seleccion = ordenes.filter((orden) => solicitadas.has(orden.id))
    const exportacion = prepararExportacion(seleccion, config, { incluirExportadas })

    return res.json({
      alb: generarLibro(CABECERAS_ALB, exportacion.filasAlb).toString('base64'),
      lal: generarLibro(CABECERAS_LAL, exportacion.filasLal).toString('base64'),
      incluidas: anotar(
        incluidas.filter((item) => solicitadas.has(item.ordenId)),
        ordenes,
      ),
    })
  } catch (error) {
    return next(error)
  }
})

// POST /marcar { ordenIds } -> marca como exportadas las órdenes finalizadas o
// entregadas de la lista: fecha de exportación y referencia del albarán.
router.post('/marcar', async (req, res, next) => {
  try {
    const { ordenIds, error } = validarOrdenIds((req.body ?? {}).ordenIds)
    if (error) {
      return res.status(400).json({ error })
    }

    const { config, configurada } = await leerConfig()
    if (!configurada) {
      return res.status(400).json({ error: 'Configura antes la serie de Factusol' })
    }

    const ordenes = await prisma.ordenReparacion.findMany({
      where: { id: { in: ordenIds }, estado: { in: ESTADOS_FACTURABLES } },
    })

    const ahora = new Date()
    if (ordenes.length > 0) {
      await prisma.$transaction(
        ordenes.map((orden) => {
          const albaran = numeroAlbaran(orden.numeroOrden)
          return prisma.ordenReparacion.update({
            where: { id: orden.id },
            data: {
              exportadaFactusolEn: ahora,
              albaranFactusol: albaran === null ? null : `${config.serie}-${albaran}`,
            },
          })
        }),
      )
    }

    return res.json({ marcadas: ordenes.length })
  } catch (error) {
    return next(error)
  }
})

// POST /desmarcar { ordenIds } -> quita la marca de exportación de esas órdenes,
// para poder repetir una exportación que falló en Factusol.
router.post('/desmarcar', async (req, res, next) => {
  try {
    const { ordenIds, error } = validarOrdenIds((req.body ?? {}).ordenIds)
    if (error) {
      return res.status(400).json({ error })
    }

    const resultado = await prisma.ordenReparacion.updateMany({
      where: { id: { in: ordenIds } },
      data: { exportadaFactusolEn: null, albaranFactusol: null },
    })

    return res.json({ desmarcadas: resultado.count })
  } catch (error) {
    return next(error)
  }
})

export default router

import { Router } from 'express'
import prisma from '../db.js'
import { authMiddleware } from './auth.js'

const router = Router()
router.use(authMiddleware)

// Los 6 estados que se muestran como columnas del tablero (las entregadas ya no ocupan tablero).
const ESTADOS_TABLERO = ['Admision', 'EnReparacion', 'EnPausa', 'EsperandoMaterial', 'Biomecanica', 'Finalizada']

// Estados que forman parte del conteo general (los 7 posibles).
const ESTADOS_CONOCIDOS = [...ESTADOS_TABLERO, 'Entregada']

// Selección de campos que necesita cada tarjeta del tablero.
const SELECT_ORDEN = {
  id: true,
  numeroOrden: true,
  estado: true,
  fechaEntrada: true,
  fechaPrevista: true,
  tipoReparacion: true,
  garantia: true,
  clienteAvisado: true,
  cliente: { select: { numeroCliente: true, nombre: true, apellidos: true, telefono: true } },
  bicicleta: { select: { marca: true, modelo: true, tipo: true } },
  mecanico: { select: { nombre: true } },
}

// Ordena por fecha prevista ascendente (las nulas al final) y, a igualdad, por fecha de entrada.
function compararOrdenes(a, b) {
  const previstaA = a.fechaPrevista ? new Date(a.fechaPrevista).getTime() : null
  const previstaB = b.fechaPrevista ? new Date(b.fechaPrevista).getTime() : null
  if (previstaA !== null && previstaB !== null && previstaA !== previstaB) return previstaA - previstaB
  if (previstaA === null && previstaB !== null) return 1
  if (previstaA !== null && previstaB === null) return -1
  return new Date(a.fechaEntrada).getTime() - new Date(b.fechaEntrada).getTime()
}

router.get('/', async (req, res, next) => {
  try {
    const inicioHoy = new Date()
    inicioHoy.setHours(0, 0, 0, 0)
    const inicioManana = new Date(inicioHoy)
    inicioManana.setDate(inicioManana.getDate() + 1)

    const [ordenesPorEstado, ordenesTablero, vencidas, finalizadasSinAvisar, entregadasHoy] = await Promise.all([
      prisma.ordenReparacion.groupBy({ by: ['estado'], _count: { _all: true } }),
      prisma.ordenReparacion.findMany({
        where: { estado: { in: ESTADOS_TABLERO } },
        select: SELECT_ORDEN,
      }),
      prisma.ordenReparacion.count({
        where: { fechaPrevista: { lt: inicioHoy }, estado: { notIn: ['Finalizada', 'Entregada'] } },
      }),
      prisma.ordenReparacion.count({ where: { estado: 'Finalizada', clienteAvisado: false } }),
      prisma.ordenReparacion.count({
        where: { estado: 'Entregada', updatedAt: { gte: inicioHoy, lt: inicioManana } },
      }),
    ])

    // Todos los estados conocidos, con 0 cuando no hay órdenes.
    const conteoPorEstado = Object.fromEntries(ESTADOS_CONOCIDOS.map((estado) => [estado, 0]))
    for (const { estado, _count } of ordenesPorEstado) conteoPorEstado[estado] = _count._all

    const columnas = {}
    for (const estado of ESTADOS_TABLERO) {
      columnas[estado] = ordenesTablero
        .filter((orden) => orden.estado === estado)
        .sort(compararOrdenes)
        .slice(0, 30)
    }

    return res.json({ conteoPorEstado, columnas, vencidas, finalizadasSinAvisar, entregadasHoy })
  } catch (error) {
    return next(error)
  }
})

export default router

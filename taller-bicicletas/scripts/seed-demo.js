import prisma from '../server/db.js'
import { calcularTotales } from '../server/routes/ordenes.js'
import { precioSinIva } from '../server/lib/precios.js'
import { sinStockDesdeNuevo } from '../server/lib/stock.js'

// Datos DEMO totalmente inventados (empresa, clientes, bicis, artículos y órdenes).
// Uso: npm run db:demo   (antes: npm run db:push && npm run db:seed)
// Es determinista y se niega a ejecutarse si la base ya contiene clientes,
// salvo con --force (que NO borra nada: solo añade).

const forzar = process.argv.includes('--force')

// Generador pseudoaleatorio con semilla fija para que la demo sea reproducible.
let semilla = 20261002
const rnd = () => {
  semilla = (semilla * 1664525 + 1013904223) % 4294967296
  return semilla / 4294967296
}
const entre = (min, max) => min + Math.floor(rnd() * (max - min + 1))
const elegir = (lista) => lista[Math.floor(rnd() * lista.length)]
const r2 = (n) => Math.round(n * 100) / 100

const NOMBRES = ['Ana', 'Marc', 'Laia', 'Pau', 'Marta', 'Joan', 'Núria', 'Pere', 'Clara', 'Oriol', 'Carla', 'Biel', 'Júlia', 'Arnau', 'Sílvia', 'Mireia', 'Albert', 'Elena', 'Sergi', 'Irene', 'Raúl', 'Paula', 'Hugo', 'Lucía', 'Iván', 'Sara', 'Dani', 'Alba', 'Nil']
const APELLIDOS = ['Garcia', 'Martínez', 'López', 'Soler', 'Puig', 'Ferrer', 'Roca', 'Vidal', 'Serra', 'Molina', 'Castells', 'Pons', 'Bosch', 'Vila', 'Ribas', 'Camps', 'Mas', 'Sala', 'Prats', 'Font', 'Gil', 'Navarro', 'Ortega', 'Romero']
const CALLES = ['Carrer Major', 'Carrer del Pedal', 'Avinguda de la Cadena', 'Plaça del Mercat', 'Carrer de la Roda', 'Passeig del Riu', 'Carrer dels Frens', 'Carrer Nou']
const POBLACIONES = [['Vilaverda', '99001'], ['Santa Pedala', '99002'], ['Rodanes', '99003'], ['Port Biela', '99004'], ['Sant Manillar', '99005']]
const MARCAS = [['Rompetechos', ['Trail 29', 'Gravel One', 'Ruta Pro']], ['Bicimort', ['XC Elite', 'Enduro 160', 'Urban 7']], ['Pedalex', ['Passeig 28', 'Kids 20', 'E-Trail']], ['Cadenza', ['Carretera SL', 'Tri Aero', 'E-City']]]
const TIPOS = ['XC', 'Trail', 'Enduro', 'Passeig', 'Gravel', 'Carretera', 'BiciInfantil', 'EBikePasseig', 'EBikeXC']
const COLORES = ['Negro', 'Rojo', 'Azul', 'Verde', 'Gris', 'Blanco', 'Naranja']

// Familias de artículos: [familia, prefijo ref, piezas, precio compra mín-máx]
const FAMILIAS = [
  ['Cubiertas', 'CUB', ['Cubierta 29x2.25', 'Cubierta 27.5x2.4', 'Cubierta 700x28', 'Cubierta 26x1.95', 'Cubierta gravel 700x40'], [12, 38]],
  ['Cámaras', 'CAM', ['Cámara 29', 'Cámara 27.5', 'Cámara 700x25', 'Cámara 26', 'Cámara válvula larga'], [3, 7]],
  ['Frenos', 'FRE', ['Pastillas disco resina', 'Pastillas disco metálicas', 'Disco 160 mm', 'Disco 180 mm', 'Latiguillo freno', 'Líquido de frenos mineral'], [6, 40]],
  ['Transmisión', 'TRA', ['Cadena 11v', 'Cadena 12v', 'Cassette 11v', 'Cassette 12v', 'Plato 34T', 'Desviador trasero', 'Pulsador de cambio'], [14, 90]],
  ['Cables y fundas', 'CBL', ['Cable de cambio', 'Cable de freno', 'Funda de cambio', 'Funda de freno', 'Terminales de cable'], [1, 9]],
  ['Ruedas', 'RUE', ['Radios 14G', 'Cinta de llanta', 'Buje delantero', 'Buje trasero', 'Llanta 29 doble pared', 'Válvula tubeless'], [2, 60]],
  ['Dirección', 'DIR', ['Juego de dirección', 'Potencia 60 mm', 'Manillar 740 mm', 'Puños ergonómicos', 'Cinta de manillar'], [8, 45]],
  ['Pedales y sillines', 'PYS', ['Pedales plataforma', 'Pedales automáticos', 'Sillín confort', 'Sillín carretera', 'Tija telescópica', 'Abrazadera de sillín'], [9, 70]],
  ['Lubricantes', 'LUB', ['Lubricante cadena seco', 'Lubricante cadena húmedo', 'Desengrasante 500 ml', 'Grasa montaje', 'Sellante tubeless 250 ml'], [4, 14]],
  ['Accesorios', 'ACC', ['Guardabarros par', 'Caballete', 'Luz delantera', 'Luz trasera', 'Timbre', 'Candado en U', 'Portabidón', 'Casco urbano'], [3, 45]],
]
const PROVEEDORES = ['Distribuciones Ficticias SL', 'Recambios Imaginarios SA', 'Mayorista Pedalea SL']

function dni() {
  const letras = 'TRWAGMYFPDXBNJZSQVHLCKE'
  const n = entre(10000000, 99999999)
  return `${n}${letras[n % 23]}`
}

async function main() {
  const clientesExistentes = await prisma.cliente.count()
  if (clientesExistentes > 0 && !forzar) {
    console.error(`La base de datos ya tiene ${clientesExistentes} clientes. Aborto para no mezclar datos (usa --force para añadir igualmente).`)
    process.exitCode = 1
    return
  }

  // Empresa ficticia (sustituye a la genérica creada por el seed base).
  const datosEmpresa = {
    nombre: 'Rompecadenas Bike Workshop, S.L.',
    cif: 'B00000000',
    direccion: 'Calle de la Cadena Rota, 13',
    codigoPostal: '99001',
    ciudad: 'Vilaverda',
    provincia: 'Provincia Demo',
    telefono: '600000000',
    email: 'info@rompecadenas.example',
    web: 'www.rompecadenas.example',
    logoUrl: '/icons/logo.png',
  }
  const empresa = await prisma.empresa.findFirst()
  if (empresa) await prisma.empresa.update({ where: { id: empresa.id }, data: datosEmpresa })
  else await prisma.empresa.create({ data: datosEmpresa })

  // Mecánicos
  const mecanicos = []
  for (const nombre of ['Zipi', 'Zape']) {
    mecanicos.push(await prisma.mecanico.upsert({ where: { nombre }, update: {}, create: { nombre } }))
  }

  // Clientes (100)
  const base = (await prisma.cliente.aggregate({ _max: { numeroCliente: true } }))._max.numeroCliente ?? 0
  const clientes = []
  for (let i = 1; i <= 100; i++) {
    const nombre = elegir(NOMBRES)
    const ap1 = elegir(APELLIDOS)
    const ap2 = elegir(APELLIDOS)
    const [poblacion, cp] = elegir(POBLACIONES)
    clientes.push(
      await prisma.cliente.create({
        data: {
          numeroCliente: base + i,
          nombre,
          apellidos: `${ap1} ${ap2}`,
          dni: dni(),
          direccion: `${elegir(CALLES)}, ${entre(1, 80)}`,
          codigoPostal: cp,
          poblacion,
          provincia: 'Provincia Demo',
          telefono: `6${String(entre(0, 99999999)).padStart(8, '0')}`,
          email: `${nombre}.${ap1}${i}@correo.example`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''),
        },
      }),
    )
  }

  // Bicicletas (20, repartidas entre los primeros clientes)
  const bicis = []
  for (let i = 0; i < 20; i++) {
    const [marca, modelos] = elegir(MARCAS)
    bicis.push(
      await prisma.bicicleta.create({
        data: {
          clienteId: clientes[i * 3].id,
          marca,
          modelo: elegir(modelos),
          color: elegir(COLORES),
          numeroSerie: `DEMO${String(100000 + i * 137)}`,
          tamano: elegir(['S', 'M', 'L', 'XL']),
          anio: entre(2016, 2025),
          tipo: elegir(TIPOS),
        },
      }),
    )
  }

  // Artículos (150)
  const articulos = []
  let n = 0
  while (articulos.length < 150) {
    for (const [familia, prefijo, piezas, [min, max]] of FAMILIAS) {
      if (articulos.length >= 150) break
      const pieza = piezas[n % piezas.length]
      const variante = Math.floor(n / piezas.length) + 1
      const compra = r2(min + rnd() * (max - min))
      const iva = 21
      const venta = r2(compra * (1.35 + rnd() * 0.4) * (1 + iva / 100)) // PVP con IVA incluido
      // ~25 de los 150 artículos se quedan sin stock, con la fecha repartida
      // entre hace 1 y 24 meses (para que el filtro se vea con datos).
      const sinStock = articulos.length % 6 === 0
      const stock = sinStock ? 0 : entre(1, 25)
      let sinStockDesde = sinStockDesdeNuevo(stock, null)
      if (sinStock) {
        sinStockDesde = new Date()
        sinStockDesde.setMonth(sinStockDesde.getMonth() - entre(1, 24))
      }
      articulos.push(
        await prisma.articulo.create({
          data: {
            referencia: `${prefijo}-${String(articulos.length + 1).padStart(4, '0')}`,
            descripcion: variante > 1 ? `${pieza} (modelo ${variante})` : pieza,
            precioCompra: compra,
            precioVenta: venta,
            iva,
            stock,
            sinStockDesde,
            familia,
            proveedor: elegir(PROVEEDORES),
          },
        }),
      )
    }
    n++
  }

  // Órdenes de reparación (9)
  const operaciones = await prisma.operacionManoObra.findMany({ where: { activo: true } })
  if (operaciones.length === 0) throw new Error('Faltan las operaciones: ejecuta antes npm run db:seed')
  const estados = ['Presupuesto', 'Pendiente', 'EnReparacion', 'EnReparacion', 'EsperandoMaterial', 'Finalizada', 'Finalizada', 'Entregada', 'Entregada']
  const problemas = ['Hace ruido al pedalear', 'Los frenos no frenan bien', 'Pinchazo en la rueda trasera', 'El cambio salta de marcha', 'Revisión antes de la temporada', 'Holgura en la dirección', 'La cadena patina']
  const anio = new Date().getFullYear()
  const ahora = Date.now()

  for (let i = 0; i < estados.length; i++) {
    const bici = bicis[i * 2]
    const materiales = []
    const usados = new Set()
    for (let k = 0; k < entre(1, 3); k++) {
      let art = elegir(articulos)
      let intentos = 0
      while (usados.has(art.id) && intentos < 6) {
        art = elegir(articulos)
        intentos++
      }
      usados.add(art.id)
      const cantidad = entre(1, 2)
      const unitario = precioSinIva(art.precioVenta, art.iva)
      const precioNeto = r2(cantidad * unitario)
      materiales.push({
        articuloId: art.id,
        referencia: art.referencia,
        descripcion: art.descripcion,
        cantidad,
        precioUnitario: unitario,
        descuento: 0,
        precioNeto,
        iva: art.iva,
        importeTotal: r2(precioNeto * (1 + art.iva / 100)),
      })
    }
    const manoObra = []
    for (let k = 0; k < entre(1, 2); k++) {
      const op = elegir(operaciones)
      manoObra.push({
        codigoOp: op.codigo,
        descripcion: op.descripcion,
        tiempo: op.tiempoDefecto,
        precioHora: op.precioHoraDefecto,
        importe: r2(op.tiempoDefecto * op.precioHoraDefecto),
      })
    }
    const totales = calcularTotales(materiales, manoObra, 0)
    // Fechas de entrada repartidas a lo largo de los últimos ~5 meses para que el
    // listado de consumo tenga datos en varios periodos (día, semana, mes, año).
    const entrada = new Date(ahora - (estados.length - i) * 17 * 86400000)
    const cerrada = ['Finalizada', 'Entregada'].includes(estados[i])
    await prisma.ordenReparacion.create({
      data: {
        numeroOrden: `ORD-${anio}-${String(i + 1).padStart(4, '0')}`,
        clienteId: bici.clienteId,
        bicicletaId: bici.id,
        fechaEntrada: entrada,
        fechaPrevista: new Date(entrada.getTime() + 4 * 86400000),
        estado: estados[i],
        problema: elegir(problemas),
        descripcion: cerrada ? 'Trabajos realizados según el presupuesto.' : null,
        tipoReparacion: elegir(['Preferente', 'Programada', 'Urgente', 'NoProgramada']),
        formaPago: estados[i] === 'Entregada'
          ? elegir(['Efectivo', 'Tarjeta', 'Bizum', 'Transferencia'])
          : (estados[i] === 'Finalizada' ? elegir(['Pendiente', 'Parcial']) : 'Pendiente'),
        mecanicoId: mecanicos[i % 2].id,
        ...totales,
        materiales: { create: materiales },
        manoObra: { create: manoObra },
      },
    })
  }

  console.log('Datos demo creados: 100 clientes, 20 bicicletas, 150 artículos, 9 órdenes, mecánicos Zipi y Zape.')
}

main()
  .catch((error) => {
    console.error('Error al crear los datos demo:', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

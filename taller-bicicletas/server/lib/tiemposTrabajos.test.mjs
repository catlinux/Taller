import test from 'node:test'
import assert from 'node:assert/strict'
import XLSX from 'xlsx'
import {
  parsearTiemposTrabajos,
  leerExcelTiempos,
  normalizarNombre,
  minutosDeCelda,
  formatearMinutos,
  prefijoCategoria,
} from './tiemposTrabajos.js'

// Pruebas del parser de la hoja «Tiempos sexagesimales» con datos FICTICIOS que
// reproducen todos los casos del formato: título, varias categorías, segunda
// cabecera dentro de una categoría, 1-3 tiempos, huecos, tiempos como texto,
// número de Excel y Date, erratas y filas vacías al final.

const FILAS = [
  ['Tiempos sexagesimales'], // título (se ignora)
  [],
  ['Dirección', 'Ajuste', 'Sustitución', 'Limp/engr. externa', 'Engrase rodamientos', 'Ruido'],
  [null, '00:10', '00:20', '00:20', '00:40', '00:20'],
  [], // separador de bloque
  ['Freno trasero', 'Ajuste/Revisión', 'Sustitución', 'Purgr'],
  [null, '00:10', '00:20', '00:20'],
  [null, null, '00:45', '00:30'],
  [],
  ['Transmisión', 'Sustitución plato ', 'Cadena'],
  [null, '00:20', 0.0138889], // número de Excel (~0:20)
  [null, '00:30', '00:25'],
  [null, 'Ruido/Apretar plato', 'Embrage'], // segunda cabecera de la misma categoría
  [null, '00:15', '00:35'],
  [null, '00:18', null],
  [],
  ['Varios', 'Montaje mando ', 'Desmontar/montar bici', 'Cambio  liquido'],
  [null, new Date(Date.UTC(1899, 11, 30, 3, 0, 0)), '03:00', '00:20'], // Date = 3:00
  [null, null, '04:00', null],
  [null, null, '05:00', null],
  [],
  [], // filas vacías al final
]

const TRABAJOS_ESPERADOS = [
  { categoria: 'Dirección', nombre: 'Ajuste', tiempos: [10], orden: 0 },
  { categoria: 'Dirección', nombre: 'Sustitución', tiempos: [20], orden: 1 },
  { categoria: 'Dirección', nombre: 'Limp/engr. externa', tiempos: [20], orden: 2 },
  { categoria: 'Dirección', nombre: 'Engrase rodamientos', tiempos: [40], orden: 3 },
  { categoria: 'Dirección', nombre: 'Ruido', tiempos: [20], orden: 4 },
  { categoria: 'Freno trasero', nombre: 'Ajuste/Revisión', tiempos: [10], orden: 0 },
  { categoria: 'Freno trasero', nombre: 'Sustitución', tiempos: [20, 45], orden: 1 },
  { categoria: 'Freno trasero', nombre: 'Purgar', tiempos: [20, 30], orden: 2 },
  { categoria: 'Transmisión', nombre: 'Sustitución plato', tiempos: [20, 30], orden: 0 },
  { categoria: 'Transmisión', nombre: 'Cadena', tiempos: [20, 25], orden: 1 },
  { categoria: 'Transmisión', nombre: 'Ruido/Apretar plato', tiempos: [15, 18], orden: 2 },
  { categoria: 'Transmisión', nombre: 'Embrague', tiempos: [35], orden: 3 },
  { categoria: 'Varios', nombre: 'Montaje mando', tiempos: [180], orden: 0 },
  { categoria: 'Varios', nombre: 'Desmontar/montar bici', tiempos: [180, 240, 300], orden: 1 },
  { categoria: 'Varios', nombre: 'Cambio líquido', tiempos: [20], orden: 2 },
]

test('parsearTiemposTrabajos interpreta bloques, segundas cabeceras, tiempos alternativos y huecos', () => {
  const { trabajos, avisos } = parsearTiemposTrabajos(FILAS)
  assert.deepEqual(trabajos, TRABAJOS_ESPERADOS)
  assert.deepEqual(avisos, [])
})

test('parsearTiemposTrabajos omite (con aviso) los trabajos que no tienen ningún tiempo', () => {
  const filas = [
    ['Categoría X', 'Trabajo con tiempo', 'Trabajo sin tiempo'],
    [null, '00:15', null],
  ]
  const { trabajos, avisos } = parsearTiemposTrabajos(filas)
  assert.deepEqual(trabajos, [{ categoria: 'Categoría X', nombre: 'Trabajo con tiempo', tiempos: [15], orden: 0 }])
  assert.deepEqual(avisos, [{ motivo: 'trabajo sin tiempos', nombre: 'Trabajo sin tiempo', categoria: 'Categoría X' }])
})

test('parsearTiemposTrabajos avisa de filas de tiempos sin cabecera', () => {
  const { trabajos, avisos } = parsearTiemposTrabajos([[null, '00:10']])
  assert.deepEqual(trabajos, [])
  assert.deepEqual(avisos, [{ motivo: 'fila de tiempos sin cabecera', categoria: null }])
})

test('minutosDeCelda admite texto, número de Excel y Date', () => {
  assert.equal(minutosDeCelda('00:20'), 20)
  assert.equal(minutosDeCelda('0:05'), 5)
  assert.equal(minutosDeCelda('1:30'), 90)
  assert.equal(minutosDeCelda('10:00'), 600)
  assert.equal(minutosDeCelda(0.0138889), 20)
  assert.equal(minutosDeCelda(0.125), 180)
  assert.equal(minutosDeCelda(new Date(Date.UTC(1899, 11, 30, 0, 20, 0))), 20)
  // No son tiempos.
  assert.equal(minutosDeCelda('Purgar'), null)
  assert.equal(minutosDeCelda('00:70'), null)
  assert.equal(minutosDeCelda(''), null)
  assert.equal(minutosDeCelda(null), null)
})

test('formatearMinutos devuelve «H:MM»', () => {
  assert.equal(formatearMinutos(20), '0:20')
  assert.equal(formatearMinutos(90), '1:30')
  assert.equal(formatearMinutos(180), '3:00')
  assert.equal(formatearMinutos(5), '0:05')
})

test('normalizarNombre recorta, colapsa espacios y corrige las erratas conocidas', () => {
  assert.equal(normalizarNombre('Montaje mando '), 'Montaje mando')
  assert.equal(normalizarNombre('Cambio  liquido'), 'Cambio líquido')
  assert.equal(normalizarNombre('Purgr'), 'Purgar')
  assert.equal(normalizarNombre('purgr'), 'purgar')
  assert.equal(normalizarNombre('Neumàtico'), 'Neumático')
  assert.equal(normalizarNombre('Embrage'), 'Embrague')
  assert.equal(normalizarNombre('sillin'), 'sillín')
  assert.equal(normalizarNombre('Liquido roto'), 'Líquido roto')
})

test('prefijoCategoria usa los prefijos fijos y, si no, las 3 primeras letras', () => {
  assert.equal(prefijoCategoria('Dirección'), 'DIR')
  assert.equal(prefijoCategoria('Freno delantero'), 'FDE')
  assert.equal(prefijoCategoria('Freno trasero'), 'FTR')
  assert.equal(prefijoCategoria('Transmisión'), 'TRA')
  assert.equal(prefijoCategoria('Cambios'), 'CAM')
  assert.equal(prefijoCategoria('Ruedas'), 'RUE')
  assert.equal(prefijoCategoria('Horquilla'), 'HOR')
  assert.equal(prefijoCategoria('Amortiguador'), 'AMO')
  assert.equal(prefijoCategoria('Tija telescópica'), 'TIJ')
  assert.equal(prefijoCategoria('Varios'), 'VAR')
  // Desconocida: 3 primeras letras sin tildes en mayúsculas.
  assert.equal(prefijoCategoria('Categoría rara'), 'CAT')
  assert.equal(prefijoCategoria('ruedas libres'), 'RUE')
})

test('leerExcelTiempos lee un .xlsx real (escrito con xlsx) y da el mismo resultado', () => {
  // Un Date se serializa al escribir el .xlsx con la zona horaria local, así que
  // aquí se usa su equivalente numérico (0.125 = 3:00) para el viaje de ida y vuelta.
  const filas = FILAS.map((fila) => fila.map((valor) => (valor instanceof Date ? 0.125 : valor)))
  const hoja = XLSX.utils.aoa_to_sheet(filas)
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Hoja1')
  const buffer = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' })

  const { trabajos, avisos } = leerExcelTiempos(buffer)
  assert.deepEqual(trabajos, TRABAJOS_ESPERADOS)
  assert.deepEqual(avisos, [])
})

test('leerExcelTiempos rechaza un contenido que no es un Excel', () => {
  assert.throws(() => leerExcelTiempos(Buffer.from('no soy un excel')), /no es un Excel válido/)
  assert.throws(() => leerExcelTiempos(Buffer.alloc(0)), /no es un Excel válido/)
})


test('una cabecera sin categoría tras una fila vacía sigue en la categoría anterior', () => {
  const filas = [
    ['Ruedas', 'Sustitución cámara', 'Centrado de rueda'],
    [null, '00:10', '00:15'],
    [null, null, null],
    [null, 'Sustitución radio', 'Sustitución llanta'],
    [null, '00:10', '01:30'],
    [null, '00:20', null],
    [null, null, null],
    ['Horquilla', 'Ajuste horquilla'],
    [null, '00:20'],
  ]
  const { trabajos } = parsearTiemposTrabajos(filas)
  const radio = trabajos.find((t) => t.nombre === 'Sustitución radio')
  assert.equal(radio.categoria, 'Ruedas')
  assert.deepEqual(radio.tiempos, [10, 20])
  assert.equal(trabajos.find((t) => t.nombre === 'Sustitución llanta').categoria, 'Ruedas')
  assert.equal(trabajos.find((t) => t.nombre === 'Ajuste horquilla').categoria, 'Horquilla')
})

// --- Formato de tabla (una fila por trabajo) --------------------------------

// Matriz FICTICIA en formato tabla: cubre fila de títulos, tiempo como número de
// Excel, texto «HH:MM» y Date, 1-3 tiempos, filas vacías entre categorías,
// categoría vacía heredada, erratas, duplicado y trabajo sin tiempo.
const FILAS_TABLA = [
  ['Categoría', 'Descripción', 'Tiempo', 'Tiempo 2', 'Tiempo 3'], // fila de títulos (se ignora)
  ['Dirección', 'Ajuste', 0.006944444444444444, null, null], // número de Excel = 0:10
  ['Dirección', 'Sustitución', '00:20', '00:45', null], // 2 tiempos (texto HH:MM)
  ['Cambios', 'Ajuste desviador', '00:10', '00:20', '00:30'], // 3 tiempos
  [], // fila vacía entre categorías
  ['Ruedas', 'Centrado de rueda', 0.013888888888888888, null, null], // número de Excel = 0:20
  [null, 'Sustitución radio', new Date(Date.UTC(1899, 11, 30, 0, 15, 0)), null, null], // categoría heredada + Date = 0:15
  ['Freno trasero', 'Purgr', '00:20', '00:45', null], // errata
  ['Freno trasero', 'Sustitución', '00:30', null, null],
  ['Freno trasero', 'Sustitución', '00:40', null, null], // duplicado: se queda el primero
  ['Freno trasero', 'Trabajo sin tiempo', null, null, null], // sin ningún tiempo: se omite
]

const TRABAJOS_TABLA_ESPERADOS = [
  { categoria: 'Dirección', nombre: 'Ajuste', tiempos: [10], orden: 0 },
  { categoria: 'Dirección', nombre: 'Sustitución', tiempos: [20, 45], orden: 1 },
  { categoria: 'Cambios', nombre: 'Ajuste desviador', tiempos: [10, 20, 30], orden: 0 },
  { categoria: 'Ruedas', nombre: 'Centrado de rueda', tiempos: [20], orden: 0 },
  { categoria: 'Ruedas', nombre: 'Sustitución radio', tiempos: [15], orden: 1 },
  { categoria: 'Freno trasero', nombre: 'Purgar', tiempos: [20, 45], orden: 0 },
  { categoria: 'Freno trasero', nombre: 'Sustitución', tiempos: [30], orden: 1 },
]

test('parsearTiemposTrabajos detecta e interpreta el formato de tabla', () => {
  const { trabajos, avisos, formato } = parsearTiemposTrabajos(FILAS_TABLA)
  assert.equal(formato, 'tabla')
  assert.deepEqual(trabajos, TRABAJOS_TABLA_ESPERADOS)
  assert.deepEqual(avisos, [
    { motivo: 'duplicado en el Excel', nombre: 'Sustitución', categoria: 'Freno trasero' },
    { motivo: 'trabajo sin tiempos', nombre: 'Trabajo sin tiempo', categoria: 'Freno trasero' },
  ])
})

test('parsearTiemposTrabajos detecta el formato por bloques', () => {
  const { formato } = parsearTiemposTrabajos(FILAS)
  assert.equal(formato, 'bloques')
})

test('el formato de tabla funciona también sin fila de títulos', () => {
  const filas = [
    ['Horquilla', 'Ajuste horquilla', '00:20', null, null],
    ['Horquilla', 'Sustitución', '00:30', '01:00', null],
  ]
  const { trabajos, avisos, formato } = parsearTiemposTrabajos(filas)
  assert.equal(formato, 'tabla')
  assert.deepEqual(trabajos, [
    { categoria: 'Horquilla', nombre: 'Ajuste horquilla', tiempos: [20], orden: 0 },
    { categoria: 'Horquilla', nombre: 'Sustitución', tiempos: [30, 60], orden: 1 },
  ])
  assert.deepEqual(avisos, [])
})

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  aplicarActualizacion,
  decidirActualizacion,
  interpretarConteo,
  parsearGitLog,
  requierenInstalarDependencias,
  SEPARADOR_CAMPOS,
  SEPARADOR_REGISTROS,
} from './actualizaciones.js'

// Pruebas de las funciones puras y del flujo de aplicación de actualizaciones
// (con un ejecutor de comandos simulado, sin tocar git de verdad).

// Aísla el fichero de "última actualización" en un directorio temporal.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'actualizaciones-'))

// --- Funciones puras ---

test('parsearGitLog separa varios registros y sus campos', () => {
  const salida =
    `abc${SEPARADOR_CAMPOS}a1b${SEPARADOR_CAMPOS}2026-10-04T10:00:00+02:00${SEPARADOR_CAMPOS}Primer commit` +
    SEPARADOR_REGISTROS +
    `def${SEPARADOR_CAMPOS}d2e${SEPARADOR_CAMPOS}2026-10-05T11:00:00+02:00${SEPARADOR_CAMPOS}Segundo commit` +
    SEPARADOR_REGISTROS

  const registros = parsearGitLog(salida)
  assert.equal(registros.length, 2)
  assert.deepEqual(registros[0], {
    sha: 'abc', corto: 'a1b', fecha: '2026-10-04T10:00:00+02:00', mensaje: 'Primer commit',
  })
  assert.equal(registros[1].mensaje, 'Segundo commit')
})

test('parsearGitLog tolera una salida vacía', () => {
  assert.deepEqual(parsearGitLog(''), [])
  assert.deepEqual(parsearGitLog(null), [])
})

test('interpretarConteo lee los dos números (adelante y atrás)', () => {
  assert.deepEqual(interpretarConteo('0\t2'), { adelante: 0, atras: 2 })
  assert.deepEqual(interpretarConteo('1 3'), { adelante: 1, atras: 3 })
  assert.deepEqual(interpretarConteo(''), { adelante: 0, atras: 0 })
})

test('decidirActualizacion cubre los tres casos', () => {
  assert.deepEqual(decidirActualizacion({ adelante: 0, atras: 2 }), { disponible: true, adelantado: false, divergido: false })
  assert.deepEqual(decidirActualizacion({ adelante: 0, atras: 0 }), { disponible: false, adelantado: false, divergido: false })
  assert.deepEqual(decidirActualizacion({ adelante: 1, atras: 2 }), { disponible: true, adelantado: true, divergido: true })
})

test('requierenInstalarDependencias detecta package.json y package-lock.json', () => {
  assert.equal(requierenInstalarDependencias(['taller-bicicletas/package.json']), true)
  assert.equal(requierenInstalarDependencias(['package-lock.json']), true)
  assert.equal(requierenInstalarDependencias(['server/index.js', 'src/App.jsx']), false)
  assert.equal(requierenInstalarDependencias([]), false)
})

// --- Flujo de aplicación con ejecutor simulado ---

// Crea un ejecutor falso a partir de un mapa de respuestas y registra las llamadas.
// Las claves son "cmd arg1 arg2"; el valor puede ser una cadena (salida) o una
// función que lanza un error.
function crearEjecutor(respuestas) {
  const llamadas = []
  const ejecutar = async (cmd, args) => {
    const clave = [cmd, ...args].join(' ')
    llamadas.push(clave)
    const respuesta = respuestas[clave]
    if (typeof respuesta === 'function') return respuesta()
    if (respuesta === undefined) throw new Error(`Comando inesperado: ${clave}`)
    return respuesta
  }
  return { ejecutar, llamadas }
}

// Respuestas de un escenario con una actualización disponible y sin problemas.
function escenarioFeliz() {
  return {
    'git rev-parse --show-toplevel': 'C:/repo',
    'git rev-parse --abbrev-ref HEAD': 'main',
    'git rev-parse HEAD': 'sha-inicial',
    'git status --porcelain --untracked-files=no': '',
    'git fetch --quiet origin main': '',
    'git rev-list --left-right --count HEAD...origin/main': '0\t2',
    'git diff --name-only HEAD origin/main': 'taller-bicicletas/package.json',
    'git merge --ff-only origin/main': '',
    'npm ci --include=dev': '',
    'npm run build': '',
    // El paso de base de datos se ejecuta con el propio binario de Node.
    [`${process.execPath} node_modules/prisma/build/index.js db push`]: '',
  }
}

test('aplicarActualizacion recorre los pasos y termina con éxito', async () => {
  const respuestas = escenarioFeliz()
  // El segundo `git rev-parse HEAD` (tras el merge) devuelve el sha nuevo.
  let vecesHead = 0
  respuestas['git rev-parse HEAD'] = () => {
    vecesHead += 1
    return vecesHead === 1 ? 'sha-inicial' : 'sha-nuevo'
  }

  const { ejecutar, llamadas } = crearEjecutor(respuestas)
  let copia = 0
  let reiniciado = 0
  const estadosVistos = []

  const resultado = await aplicarActualizacion({
    cwd: 'C:/repo',
    ejecutar,
    npmComando: 'npm',
    copiaSeguridad: async () => { copia += 1 },
    reiniciar: async () => { reiniciado += 1 },
    onPaso: ({ pasos }) => estadosVistos.push(...pasos.map((p) => p.estado)),
    estado: {},
  })

  assert.equal(resultado.ok, true)
  assert.equal(resultado.desde, 'sha-inicial')
  assert.equal(resultado.hasta, 'sha-nuevo')
  assert.equal(copia, 1)
  assert.equal(reiniciado, 1)
  assert.ok(llamadas.includes('git merge --ff-only origin/main'))
  assert.ok(llamadas.includes('npm ci --include=dev'))
  assert.ok(llamadas.includes('npm run build'))
  assert.ok(estadosVistos.includes('ok'))
})

test('aplicarActualizacion falla si no hay actualizaciones y no integra nada', async () => {
  const respuestas = escenarioFeliz()
  respuestas['git rev-list --left-right --count HEAD...origin/main'] = '0\t0'

  const { ejecutar, llamadas } = crearEjecutor(respuestas)
  const resultado = await aplicarActualizacion({ cwd: 'C:/repo', ejecutar, npmComando: 'npm', estado: {} })

  assert.equal(resultado.ok, false)
  assert.match(resultado.error, /No hay actualizaciones disponibles/)
  assert.equal(llamadas.includes('git merge --ff-only origin/main'), false)
})

test('aplicarActualizacion revierte si falla la compilación', async () => {
  const respuestas = escenarioFeliz()
  respuestas['npm run build'] = () => { throw new Error('fallo de compilación') }
  respuestas['git reset --hard sha-inicial'] = ''

  const { ejecutar, llamadas } = crearEjecutor(respuestas)
  const estado = {}
  const resultado = await aplicarActualizacion({ cwd: 'C:/repo', ejecutar, npmComando: 'npm', estado })

  assert.equal(resultado.ok, false)
  assert.match(resultado.error, /fallo de compilación/)
  assert.ok(llamadas.includes('git reset --hard sha-inicial'))
  assert.ok(estado.log.some((linea) => linea.includes('Reversión aplicada')))
})


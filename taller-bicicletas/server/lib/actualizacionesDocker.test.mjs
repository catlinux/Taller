import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { interpretarEstado, leerEstadoDocker, solicitar } from './actualizacionesDocker.js'

// Carpeta de control temporal con los ficheros que escribiría vigilante.sh.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'control-'))
process.env.CONTROL_DIR = dir
const reg = (sha, fecha, msg) => `${sha}\u001f${sha.slice(0, 7)}\u001f${fecha}\u001f${msg}\u001e`
const escribir = (nombre, texto) => fs.writeFileSync(path.join(dir, nombre), texto)

test('interpretarEstado reconoce ejecutando, ok y error', () => {
  assert.equal(interpretarEstado('').resultado, null)
  assert.equal(interpretarEstado('ejecutando|2026-10-04T21:00:00+02:00').ejecutando, true)
  assert.deepEqual(interpretarEstado('ok|2026-10-04T21:02:00+02:00|abc1234').resultado, { ok: true, fecha: '2026-10-04T21:02:00+02:00', hasta: 'abc1234' })
  const fallo = interpretarEstado('error|2026-10-04T21:02:00+02:00|npm ci falló')
  assert.equal(fallo.resultado.ok, false)
  assert.equal(fallo.resultado.error, 'npm ci falló')
})

test('sin datos del vigilante avisa de que falta el cron', () => {
  const estado = leerEstadoDocker()
  assert.equal(estado.disponible, false)
  assert.match(estado.ultimoError, /crontab/)
})

test('lee versión, cambios disponibles y estado de la actualización', () => {
  escribir('rama.txt', 'main\n')
  escribir('local.log', reg('1111111aaaa', '2026-10-04T20:00:00+02:00', 'Versión instalada'))
  escribir('remoto.log', reg('3333333cccc', '2026-10-05T09:00:00+02:00', 'Tercer cambio'))
  escribir('cambios.log', reg('3333333cccc', '2026-10-05T09:00:00+02:00', 'Tercer cambio') + reg('2222222bbbb', '2026-10-05T08:00:00+02:00', 'Segundo cambio'))
  escribir('conteo.txt', '0\t2\n')
  escribir('comprobado.txt', '2026-10-05T09:05:00+02:00\n')
  escribir('error.txt', '')
  const estado = leerEstadoDocker()
  assert.equal(estado.disponible, true)
  assert.equal(estado.atrasadas, 2)
  assert.deepEqual(estado.cambios.map((c) => c.mensaje), ['Tercer cambio', 'Segundo cambio'])
  assert.equal(estado.version.corto, '1111111')
  assert.equal(estado.version.rama, 'main')
  assert.equal(estado.ultimoError, null)
  assert.equal(estado.aplicando, false)

  solicitar('actualizar')
  assert.equal(leerEstadoDocker().aplicando, true)
  fs.rmSync(path.join(dir, 'actualizar'))

  escribir('estado.txt', 'ok|2026-10-05T09:10:00+02:00|3333333\n')
  escribir('actualizacion.log', '▶ Copia\n▶ Descargando\n✔ Actualizado\n')
  const final = leerEstadoDocker()
  assert.equal(final.resultado.ok, true)
  assert.equal(final.pasos[0].estado, 'ok')
  assert.equal(final.log.at(-1), '✔ Actualizado')
})

test('si el historial divergió no ofrece actualizar', () => {
  escribir('conteo.txt', '1\t2\n')
  const estado = leerEstadoDocker()
  assert.equal(estado.divergido, true)
  assert.equal(estado.disponible, false)
  fs.rmSync(dir, { recursive: true, force: true })
})

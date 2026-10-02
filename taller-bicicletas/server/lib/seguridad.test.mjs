import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { cabecerasSeguridad, crearLimitadorLogin, VENTANA_LOGIN_MS } from './seguridad.js'

// Pruebas del endurecimiento: cabeceras de seguridad y limitador de login.

// Respuesta mínima compatible con lo que usa el middleware.
function crearRes() {
  const res = new EventEmitter()
  res.statusCode = 200
  res.headers = {}
  res.setHeader = (nombre, valor) => {
    res.headers[nombre.toLowerCase()] = valor
    return res
  }
  res.status = (codigo) => {
    res.statusCode = codigo
    return res
  }
  res.json = (cuerpo) => {
    res.cuerpo = cuerpo
    return res
  }
  return res
}

// Simula una petición: devuelve la respuesta y si el middleware dejó pasar.
function peticion(limitador, ip) {
  const req = { ip, socket: { remoteAddress: ip } }
  const res = crearRes()
  let paso = false
  limitador(req, res, () => {
    paso = true
  })
  return { res, paso: () => paso }
}

// Simula que el handler ha respondido con ese código (dispara 'finish').
function responder(res, codigo) {
  res.statusCode = codigo
  res.emit('finish')
}

test('cabecerasSeguridad añade las cabeceras básicas', () => {
  const res = crearRes()
  let paso = false
  cabecerasSeguridad({}, res, () => {
    paso = true
  })
  assert.equal(paso, true)
  assert.equal(res.headers['x-content-type-options'], 'nosniff')
  assert.equal(res.headers['x-frame-options'], 'DENY')
  assert.equal(res.headers['referrer-policy'], 'same-origin')
  assert.equal(res.headers['permissions-policy'], 'camera=(), microphone=(), geolocation=()')
})

test('permite 10 fallos y bloquea el 11.º con 429 y Retry-After', () => {
  const limitador = crearLimitadorLogin({ ahora: () => 0, limpiezaMs: 1e9 })
  const ip = '10.0.0.1'

  for (let i = 0; i < 10; i += 1) {
    const { res, paso } = peticion(limitador, ip)
    assert.equal(paso(), true)
    responder(res, 401)
  }

  const bloqueada = peticion(limitador, ip)
  assert.equal(bloqueada.paso(), false)
  assert.equal(bloqueada.res.statusCode, 429)
  assert.equal(bloqueada.res.cuerpo.error, 'Demasiados intentos. Inténtalo de nuevo en unos minutos.')
  assert.ok(Number(bloqueada.res.headers['retry-after']) > 0)
})

test('un login correcto reinicia el contador de esa IP', () => {
  const limitador = crearLimitadorLogin({ ahora: () => 0, limpiezaMs: 1e9 })
  const ip = '10.0.0.2'

  for (let i = 0; i < 5; i += 1) responder(peticion(limitador, ip).res, 401)

  const ok = peticion(limitador, ip)
  assert.equal(ok.paso(), true)
  responder(ok.res, 200)

  // Tras el éxito vuelve a disponer de 10 intentos.
  for (let i = 0; i < 10; i += 1) {
    const { res, paso } = peticion(limitador, ip)
    assert.equal(paso(), true)
    responder(res, 401)
  }
  assert.equal(peticion(limitador, ip).res.statusCode, 429)
})

test('la ventana caduca y vuelve a permitir intentos', () => {
  let t = 0
  const limitador = crearLimitadorLogin({ ahora: () => t, limpiezaMs: 1e9 })
  const ip = '10.0.0.3'

  for (let i = 0; i < 10; i += 1) responder(peticion(limitador, ip).res, 401)
  assert.equal(peticion(limitador, ip).res.statusCode, 429)

  t += VENTANA_LOGIN_MS + 1
  const { res, paso } = peticion(limitador, ip)
  assert.equal(paso(), true)
  assert.equal(res.statusCode, 200)
})

test('cada IP tiene su propio contador', () => {
  const limitador = crearLimitadorLogin({ ahora: () => 0, limpiezaMs: 1e9 })
  for (let i = 0; i < 10; i += 1) responder(peticion(limitador, '10.0.0.4').res, 401)
  assert.equal(peticion(limitador, '10.0.0.4').res.statusCode, 429)
  assert.equal(peticion(limitador, '10.0.0.5').paso(), true)
})

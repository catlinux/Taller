// Actualizaciones en modo «externo»: la aplicación no se actualiza a sí misma, sino
// que lo hace un vigilante que corre fuera de ella y comparte una carpeta de control.
//
// Se usa en dos instalaciones:
//   * Docker (ACTUALIZACIONES=docker): dentro del contenedor no hay git ni se puede
//     reconstruir la imagen, así que el servidor anfitrión lo hace con
//     deploy/docker/vigilante.sh (cron del usuario que gestiona Docker).
//   * Windows (ACTUALIZACIONES=externo): node bloquea los ficheros de la propia
//     aplicación, así que actualiza deploy/windows/vigilante.ps1 (tarea programada).
//
// En ambos casos la comunicación es por una carpeta compartida de control
// (CONTROL_DIR, por defecto /control):
//
//   El vigilante escribe:
//     local.log        `git log -1` de la versión instalada (HEAD del clon)
//     remoto.log       `git log -1` de origin/<rama>
//     cambios.log      `git log HEAD..origin/<rama>` (máx. 50)
//     conteo.txt       `git rev-list --left-right --count HEAD...origin/<rama>`
//     rama.txt         rama del clon
//     comprobado.txt   fecha ISO de la última comprobación
//     error.txt        último error de la comprobación (vacío si fue bien)
//     estado.txt       estado de la última actualización: «ejecutando|inicio»,
//                      «ok|fin|sha» o «error|fin|mensaje»
//     actualizacion.log salida de update.sh
//   La aplicación escribe (órdenes que el vigilante recoge en pocos segundos):
//     comprobar        pide una comprobación inmediata
//     actualizar       pide aplicar la actualización (reconstruye el contenedor)
//
// Los ficheros de git usan el mismo formato que parsearGitLog/interpretarConteo.

import fs from 'node:fs'
import path from 'node:path'
import { decidirActualizacion, interpretarConteo, parsearGitLog } from './actualizaciones.js'

// Docker y Windows usan el mismo protocolo de ficheros; solo cambia quién ejecuta
// el vigilante. La aplicación trata ambos como modo «externo».
export const esModoExterno = () =>
  process.env.ACTUALIZACIONES === 'docker' || process.env.ACTUALIZACIONES === 'externo'
export const esModoDocker = () => process.env.ACTUALIZACIONES === 'docker'
export const carpetaControl = () => process.env.CONTROL_DIR || '/control'

function leer(nombre) {
  try {
    return fs.readFileSync(path.join(carpetaControl(), nombre), 'utf8')
  } catch {
    return ''
  }
}

function fechaModificacion(nombre) {
  try {
    return fs.statSync(path.join(carpetaControl(), nombre)).mtimeMs
  } catch {
    return 0
  }
}

// Interpreta estado.txt («ejecutando|inicio», «ok|fin|sha», «error|fin|mensaje»).
export function interpretarEstado(texto) {
  const [tipo, fecha, ...resto] = String(texto ?? '').trim().split('|')
  if (!tipo) return { ejecutando: false, resultado: null }
  if (tipo === 'ejecutando') return { ejecutando: true, inicio: fecha || null, resultado: null }
  if (tipo === 'ok') return { ejecutando: false, resultado: { ok: true, fecha: fecha || null, hasta: resto.join('|') || null } }
  return { ejecutando: false, resultado: { ok: false, fecha: fecha || null, error: resto.join('|') || 'Error desconocido' } }
}

// ¿Existe la carpeta compartida con el anfitrión? Sin ella no hay vigilante.
export function hayControl() {
  try {
    return fs.statSync(carpetaControl()).isDirectory()
  } catch {
    return false
  }
}

// Construye el estado de actualizaciones a partir de los ficheros del vigilante.
export function leerEstadoDocker() {
  const conteo = interpretarConteo(leer('conteo.txt'))
  const decision = decidirActualizacion(conteo)
  const rama = leer('rama.txt').trim() || 'main'
  const [version] = parsearGitLog(leer('local.log'))
  const [remoto] = parsearGitLog(leer('remoto.log'))
  const { ejecutando, resultado } = interpretarEstado(leer('estado.txt'))
  const log = leer('actualizacion.log').split('\n').filter((linea) => linea.trim() !== '').slice(-200)
  const comprobado = leer('comprobado.txt').trim() || null
  const error = leer('error.txt').trim() || null

  let ultimoError = error
  if (!hayControl()) {
    ultimoError = `No se encuentra la carpeta de control ${carpetaControl()}: revisa la configuración del vigilante (volumen «control» en Docker o la carpeta control en Windows).`
  } else if (!comprobado && !error) {
    ultimoError = 'Aún no hay datos del vigilante del servidor. Comprueba que está en marcha (el cron de deploy/docker/vigilante.sh en Docker, o la tarea programada «Taller vigilante» en Windows).'
  }

  return {
    esRepositorio: true,
    version: version ? { ...version, rama } : null,
    remoto: remoto ?? null,
    disponible: decision.disponible && !decision.divergido,
    adelantado: decision.adelantado,
    divergido: decision.divergido,
    atrasadas: conteo.atras,
    cambios: conteo.atras > 0 ? parsearGitLog(leer('cambios.log')) : [],
    ultimaComprobacion: comprobado,
    ultimoError,
    aplicando: ejecutando || fs.existsSync(path.join(carpetaControl(), 'actualizar')),
    pasos: ejecutando || resultado
      ? [{ clave: 'externo', etiqueta: 'Copia de seguridad, descarga y actualización de la aplicación', estado: ejecutando ? 'en curso' : resultado.ok ? 'ok' : 'error' }]
      : [],
    log,
    resultado,
  }
}

// Deja una orden para el vigilante («comprobar» o «actualizar»).
export function solicitar(orden) {
  fs.writeFileSync(path.join(carpetaControl(), orden), new Date().toISOString())
}

// Espera (como mucho `maxMs`) a que el vigilante publique una comprobación nueva.
export async function esperarComprobacion(desdeMs, maxMs = 45000) {
  const limite = Date.now() + maxMs
  while (Date.now() < limite) {
    if (fechaModificacion('comprobado.txt') > desdeMs || fechaModificacion('error.txt') > desdeMs) return true
    await new Promise((resolver) => setTimeout(resolver, 1000))
  }
  return false
}

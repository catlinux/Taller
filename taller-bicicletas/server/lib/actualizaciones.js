// Sistema de actualizaciones de la aplicación instalada.
//
// La aplicación se despliega clonando el repositorio git en el servidor. Este
// módulo sabe leer la versión instalada, comprobar si hay cambios en el remoto
// (git fetch + comparación) y aplicar una actualización solo por fast-forward,
// con copia de seguridad previa y reversión si algo falla.
//
// Nada se ejecuta automáticamente salvo la comprobación (fetch + comparar). La
// aplicación de cambios siempre la dispara un administrador desde la interfaz.
//
// Todo el acceso a comandos pasa por `ejecutar(cmd, args, opciones)`, que se
// puede inyectar en las pruebas para no tocar git de verdad.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// --- Separadores para parsear la salida de `git log` de forma robusta. ---
// Los mensajes de commit pueden contener saltos de línea, comillas o tabuladores,
// así que usamos separadores de control poco probables en un mensaje.
export const SEPARADOR_REGISTROS = '\u001e'
export const SEPARADOR_CAMPOS = '\u001f'

// Límite de líneas de log que se conservan en el estado compartido.
const MAX_LOG = 200

// Tiempos máximos por operación (milisegundos).
const TIMEOUT_GIT = 30 * 1000
const TIMEOUT_NPM = 10 * 60 * 1000
const TIMEOUT_DB = 2 * 60 * 1000
const TIMEOUT_BUILD = 5 * 60 * 1000

// Comando npm según la plataforma (en Windows hay que usar npm.cmd).
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm'

// Definición de los pasos de la actualización, en orden.
export const PASOS_ACTUALIZACION = [
  { clave: 'repositorio', etiqueta: 'Comprobando repositorio' },
  { clave: 'copia', etiqueta: 'Copia de seguridad' },
  { clave: 'descarga', etiqueta: 'Descargando cambios' },
  { clave: 'dependencias', etiqueta: 'Instalando dependencias' },
  { clave: 'baseDatos', etiqueta: 'Actualizando la base de datos' },
  { clave: 'compilacion', etiqueta: 'Compilando la aplicación' },
  { clave: 'reinicio', etiqueta: 'Reiniciando' },
]

// En producción el servidor corre con NODE_ENV=production y npm ci omitiría las
// dependencias de desarrollo, pero vite (compilar) y prisma (esquema) lo son.
const ARGS_NPM_CI = ['ci', '--include=dev']

// Ejecutor por defecto: lanza un proceso y captura su salida con un timeout.
// Usa spawn (sin shell) con argumentos fijos, nunca comandos construidos con
// entrada del usuario. Devuelve la salida combinada si el proceso sale con 0.
export function ejecutarPorDefecto(cmd, args, { cwd, timeout = TIMEOUT_GIT, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    let hijo
    try {
      hijo = spawn(cmd, args, { cwd, env, windowsHide: true })
    } catch (error) {
      reject(error)
      return
    }

    let salida = ''
    let error = ''
    let terminado = false

    const temporizador = timeout > 0
      ? setTimeout(() => {
        terminado = true
        try { hijo.kill('SIGKILL') } catch { /* el proceso ya no existe */ }
        reject(new Error(`El comando ${cmd} ${args.join(' ')} tardó más de ${Math.round(timeout / 1000)} s`))
      }, timeout)
      : null

    hijo.stdout?.on('data', (dato) => { salida += dato })
    hijo.stderr?.on('data', (dato) => { error += dato })
    hijo.on('error', (e) => {
      if (terminado) return
      terminado = true
      if (temporizador) clearTimeout(temporizador)
      reject(e)
    })
    hijo.on('close', (codigo) => {
      if (terminado) return
      terminado = true
      if (temporizador) clearTimeout(temporizador)
      if (codigo === 0) resolve(salida)
      else reject(new Error((error || salida || `El comando salió con código ${codigo}`).trim()))
    })
  })
}

// Ejecuta un comando git y devuelve su salida sin espacios sobrantes.
async function git(ejecutar, cwd, args, timeout = TIMEOUT_GIT) {
  const salida = await ejecutar('git', args, { cwd, timeout })
  return String(salida).trim()
}

// Formato de `git log` que usamos: sha completo, sha corto, fecha ISO y asunto.
const FORMATO_LOG = `%H${SEPARADOR_CAMPOS}%h${SEPARADOR_CAMPOS}%cI${SEPARADOR_CAMPOS}%s${SEPARADOR_REGISTROS}`

// --- Funciones puras (probadas en actualizaciones.test.mjs) ---

// Parsea la salida de `git log --pretty=format:<FORMATO_LOG>` y devuelve un
// array de { sha, corto, fecha, mensaje }. Tolerante a vacíos y líneas sueltas.
export function parsearGitLog(salida) {
  return String(salida ?? '')
    .split(SEPARADOR_REGISTROS)
    .map((registro) => registro.trim())
    .filter(Boolean)
    .map((registro) => {
      const [sha, corto, fecha, ...resto] = registro.split(SEPARADOR_CAMPOS)
      return {
        sha: sha ?? '',
        corto: corto ?? '',
        fecha: fecha ?? '',
        mensaje: resto.join(SEPARADOR_CAMPOS).trim(),
      }
    })
}

// Interpreta la salida de `git rev-list --left-right --count HEAD...origin/rama`
// (dos números separados por espacio o tabulador: adelante, atrás).
export function interpretarConteo(salida) {
  const partes = String(salida ?? '').trim().split(/\s+/)
  const adelante = Number.parseInt(partes[0], 10) || 0
  const atras = Number.parseInt(partes[1], 10) || 0
  return { adelante, atras }
}

// Decide el estado a partir de los commits adelantados (locales sin publicar) y
// atrasados (remotos que faltan por integrar).
export function decidirActualizacion({ adelante = 0, atras = 0 } = {}) {
  return {
    disponible: atras > 0,
    adelantado: adelante > 0,
    divergido: adelante > 0 && atras > 0,
  }
}

// Indica si, tras actualizar, hay que reinstalar dependencias: solo cuando
// cambió package.json o package-lock.json (en cualquier subcarpeta).
export function requierenInstalarDependencias(archivos = []) {
  return archivos.some((archivo) => {
    const nombre = String(archivo).replace(/\\/g, '/').split('/').pop()
    return nombre === 'package.json' || nombre === 'package-lock.json'
  })
}

// --- Acceso al repositorio ---

// ¿El directorio indicado está dentro de un repositorio git?
export async function esRepositorioGit(cwd = process.cwd(), ejecutar = ejecutarPorDefecto) {
  try {
    await ejecutar('git', ['rev-parse', '--show-toplevel'], { cwd, timeout: TIMEOUT_GIT })
    return true
  } catch {
    return false
  }
}

// Versión instalada localmente (rama, sha, fecha y asunto del último commit).
export async function leerVersionLocal(cwd = process.cwd(), ejecutar = ejecutarPorDefecto) {
  const rama = await git(ejecutar, cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const sha = await git(ejecutar, cwd, ['rev-parse', 'HEAD'])
  const [registro] = parsearGitLog(await git(ejecutar, cwd, ['log', '-1', `--pretty=format:${FORMATO_LOG}`]))
  return {
    sha,
    corto: registro?.corto ?? sha.slice(0, 7),
    fecha: registro?.fecha ?? null,
    mensaje: registro?.mensaje ?? '',
    rama,
  }
}

// Comprueba si hay actualizaciones: hace `git fetch origin <rama>` y compara el
// HEAD local con origin/<rama>. No modifica el árbol de trabajo.
export async function comprobarActualizaciones({ cwd = process.cwd(), ejecutar = ejecutarPorDefecto, rama } = {}) {
  const ramaActual = rama || (await git(ejecutar, cwd, ['rev-parse', '--abbrev-ref', 'HEAD']))
  await ejecutar('git', ['fetch', '--quiet', 'origin', ramaActual], { cwd, timeout: TIMEOUT_GIT })

  const conteo = await git(ejecutar, cwd, ['rev-list', '--left-right', '--count', `HEAD...origin/${ramaActual}`])
  const { adelante, atras } = interpretarConteo(conteo)
  const decision = decidirActualizacion({ adelante, atras })

  const remoto = parsearGitLog(
    await git(ejecutar, cwd, ['log', '-1', `--pretty=format:${FORMATO_LOG}`, `origin/${ramaActual}`]),
  )[0] ?? null

  const cambios = atras > 0
    ? parsearGitLog(
      await git(ejecutar, cwd, ['log', '-50', `--pretty=format:${FORMATO_LOG}`, `HEAD..origin/${ramaActual}`]),
    )
    : []

  return { ...decision, atrasadas: atras, cambios, remoto, rama: ramaActual }
}

// --- Estado compartido en memoria (lo consulta la ruta GET) ---

export const estadoActualizaciones = {
  ultimaComprobacion: null,
  ultimoError: null,
  disponible: false,
  adelantado: false,
  divergido: false,
  atrasadas: 0,
  cambios: [],
  remoto: null,
  version: null,
  esRepositorio: false,
  aplicando: false,
  pasos: [],
  log: [],
  resultado: null,
}

// Ejecuta una comprobación y deja el resultado (o el error) en el estado.
export async function ejecutarComprobacion({ cwd = process.cwd(), ejecutar = ejecutarPorDefecto } = {}) {
  try {
    const esRepositorio = await esRepositorioGit(cwd, ejecutar)
    estadoActualizaciones.esRepositorio = esRepositorio
    if (!esRepositorio) {
      throw new Error('La aplicación no se ha instalado desde un repositorio git; no se pueden comprobar actualizaciones.')
    }
    const version = await leerVersionLocal(cwd, ejecutar)
    const resultado = await comprobarActualizaciones({ cwd, ejecutar, rama: version.rama })
    Object.assign(estadoActualizaciones, resultado, {
      version,
      ultimaComprobacion: new Date().toISOString(),
      ultimoError: null,
    })
  } catch (error) {
    estadoActualizaciones.ultimaComprobacion = new Date().toISOString()
    estadoActualizaciones.ultimoError = error?.message || String(error)
  }
  return estadoActualizaciones
}

// --- Ruta del fichero donde se anota la última actualización aplicada ---
// (dentro de DATA_DIR, igual que data/modo.json).

function carpetaDatos() {
  return path.resolve(process.cwd(), process.env.DATA_DIR || './data')
}

export function rutaUltimaActualizacion() {
  return path.join(carpetaDatos(), 'ultima-actualizacion.json')
}

export function leerUltimaActualizacion() {
  try {
    return JSON.parse(fs.readFileSync(rutaUltimaActualizacion(), 'utf8'))
  } catch {
    return null
  }
}

function escribirUltimaActualizacion(datos) {
  fs.mkdirSync(carpetaDatos(), { recursive: true })
  fs.writeFileSync(rutaUltimaActualizacion(), JSON.stringify(datos))
}

// --- Aplicación de la actualización ---

// Aplica una actualización paso a paso. Devuelve { ok, ... }.
//
// Opciones:
//   cwd:            directorio de trabajo (la subcarpeta de la app).
//   ejecutar:       ejecutor de comandos inyectable.
//   copiaSeguridad: async () => { ... } que crea la copia antes de tocar nada.
//   reiniciar:      función que reinicia el servicio (por defecto no hace nada).
//   onPaso:         callback ({ pasos, log }) en cada cambio.
//   ahora:          reloj inyectable para las pruebas.
//   estado:         objeto de estado compartido a actualizar.
export async function aplicarActualizacion({
  cwd = process.cwd(),
  ejecutar = ejecutarPorDefecto,
  copiaSeguridad,
  reiniciar,
  onPaso,
  ahora = () => new Date(),
  npmComando = NPM,
  estado = estadoActualizaciones,
} = {}) {
  const pasos = PASOS_ACTUALIZACION.map((paso) => ({ ...paso, estado: 'pendiente' }))
  const log = []

  const publicar = () => {
    estado.pasos = pasos.map((paso) => ({ ...paso }))
    estado.log = [...log]
    if (onPaso) onPaso({ pasos: estado.pasos, log: estado.log })
  }
  const anotar = (texto) => {
    log.push(texto)
    if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG)
    publicar()
  }
  const marcar = (clave, valor) => {
    const paso = pasos.find((p) => p.clave === clave)
    if (paso) paso.estado = valor
    publicar()
  }
  const ejecutarPaso = async (clave, etiqueta, fn) => {
    marcar(clave, 'en curso')
    anotar(`▶ ${etiqueta}`)
    try {
      const resultado = await fn()
      marcar(clave, 'ok')
      anotar(`✓ ${etiqueta}`)
      return resultado
    } catch (error) {
      marcar(clave, 'error')
      anotar(`✖ ${etiqueta}: ${error.message}`)
      throw error
    }
  }

  let shaAnterior = null
  let archivosCambiados = []
  let integrado = false

  publicar()


  try {
    const info = await ejecutarPaso('repositorio', 'Comprobando repositorio', async () => {
      if (!(await esRepositorioGit(cwd, ejecutar))) {
        throw new Error('La aplicación no está instalada desde un repositorio git.')
      }
      const rama = await git(ejecutar, cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])
      shaAnterior = await git(ejecutar, cwd, ['rev-parse', 'HEAD'])

      const sucio = await git(ejecutar, cwd, ['status', '--porcelain', '--untracked-files=no'])
      if (sucio) {
        throw new Error('Hay cambios locales sin confirmar en el servidor. Confírmalos o descártalos antes de actualizar (revisa `git status` y, si procede, `git stash` o `git checkout -- .`).')
      }

      await ejecutar('git', ['fetch', '--quiet', 'origin', rama], { cwd, timeout: TIMEOUT_GIT })

      const conteo = await git(ejecutar, cwd, ['rev-list', '--left-right', '--count', `HEAD...origin/${rama}`])
      const { adelante, atras } = interpretarConteo(conteo)
      if (adelante > 0) {
        throw new Error('El repositorio local tiene cambios confirmados que no están en el remoto (ha divergido). Publícalos o vuelve a clonar el repositorio antes de actualizar.')
      }
      if (atras === 0) {
        throw new Error('No hay actualizaciones disponibles.')
      }

      archivosCambiados = (await git(ejecutar, cwd, ['diff', '--name-only', 'HEAD', `origin/${rama}`]))
        .split('\n').map((linea) => linea.trim()).filter(Boolean)
      return { rama }
    })

    if (copiaSeguridad) {
      await ejecutarPaso('copia', 'Copia de seguridad', async () => {
        anotar('Creando copia de seguridad de la base de datos…')
        await copiaSeguridad()
      })
    } else {
      marcar('copia', 'ok')
    }

    await ejecutarPaso('descarga', 'Descargando cambios', async () => {
      await ejecutar('git', ['merge', '--ff-only', `origin/${info.rama}`], { cwd, timeout: TIMEOUT_GIT })
      integrado = true
    })

    const necesitaDependencias = requierenInstalarDependencias(archivosCambiados)
    await ejecutarPaso('dependencias', 'Instalando dependencias', async () => {
      if (!necesitaDependencias) {
        anotar('No han cambiado las dependencias; se omite npm ci.')
        return
      }
      await ejecutar(npmComando, ARGS_NPM_CI, { cwd, timeout: TIMEOUT_NPM })
    })

    await ejecutarPaso('baseDatos', 'Actualizando la base de datos', async () => {
      await ejecutar(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push'], { cwd, timeout: TIMEOUT_DB })
    })

    await ejecutarPaso('compilacion', 'Compilando la aplicación', async () => {
      await ejecutar(npmComando, ['run', 'build'], { cwd, timeout: TIMEOUT_BUILD })
    })

    const shaNuevo = await git(ejecutar, cwd, ['rev-parse', 'HEAD'])
    escribirUltimaActualizacion({ desde: shaAnterior, hasta: shaNuevo, fecha: ahora().toISOString(), ok: true })

    await ejecutarPaso('reinicio', 'Reiniciando', async () => {
      anotar('El servicio se reiniciará en unos segundos; la aplicación quedará disponible al momento.')
      if (reiniciar) await reiniciar()
    })

    estado.resultado = { ok: true, desde: shaAnterior, hasta: shaNuevo }
    return estado.resultado
  } catch (error) {
    anotar(`Error: ${error.message}`)

    // Reversión (solo tiene sentido si ya se había integrado el merge).
    if (integrado && shaAnterior) {
      anotar(`Revirtiendo al estado anterior (${shaAnterior.slice(0, 7)})…`)
      try {
        await ejecutar('git', ['reset', '--hard', shaAnterior], { cwd, timeout: TIMEOUT_GIT })
        anotar('Reversión aplicada.')
        if (requierenInstalarDependencias(archivosCambiados)) {
          anotar('Reinstalando dependencias del estado anterior…')
          await ejecutar(npmComando, ARGS_NPM_CI, { cwd, timeout: TIMEOUT_NPM })
            .catch(() => anotar('No se pudieron reinstalar las dependencias.'))
        }
        await ejecutar(npmComando, ['run', 'build'], { cwd, timeout: TIMEOUT_BUILD })
          .catch(() => anotar('No se pudo recompilar tras la reversión.'))
      } catch (errorReversion) {
        anotar(`No se pudo revertir automáticamente: ${errorReversion.message}`)
      }
    }

    estado.resultado = { ok: false, error: error.message, desde: shaAnterior }
    return estado.resultado
  }
}


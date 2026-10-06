// Parser de la hoja «Tiempos sexagesimales» (Excel de tiempos de trabajos del
// taller) y utilidades para importarla al catálogo de Operaciones.
//
// Módulo puro (sin Prisma ni Express): recibe las filas ya leídas de la hoja
// (XLSX.utils.sheet_to_json con { header: 1, raw: true, defval: null }) y
// devuelve los trabajos con su categoría, sus tiempos (en minutos) y su orden.

import XLSX from 'xlsx'

// Erratas conocidas del Excel: [mal, bien]. Se corrigen como palabras completas.
const ERRATAS = [
  ['purgr', 'purgar'],
  ['neumàtico', 'neumático'],
  ['embrage', 'embrague'],
  ['sillin', 'sillín'],
  ['liquido', 'líquido'],
]

// Prefijos de código fijos por categoría (las demás usan sus 3 primeras letras).
const PREFIJOS_CATEGORIA = {
  direccion: 'DIR',
  'freno delantero': 'FDE',
  'freno trasero': 'FTR',
  transmision: 'TRA',
  cambios: 'CAM',
  ruedas: 'RUE',
  horquilla: 'HOR',
  amortiguador: 'AMO',
  'tija telescopica': 'TIJ',
  varios: 'VAR',
}

const PRIMERA_COLUMNA = 1 // columna B
const ULTIMA_COLUMNA = 8 // columna I

// Celda vacía: null, undefined o texto solo con espacios.
function esVacio(valor) {
  return valor === null || valor === undefined || (typeof valor === 'string' && valor.trim() === '')
}

// Clave de comparación: sin tildes, en minúsculas y con espacios colapsados.
function normalizarClave(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// Corrige las erratas conocidas conservando la mayúscula inicial de cada palabra.
function corregirErratas(texto) {
  let resultado = texto
  for (const [mal, bien] of ERRATAS) {
    const patron = new RegExp(`(?<!\\p{L})${mal}(?!\\p{L})`, 'giu')
    resultado = resultado.replace(patron, (coincidencia) => {
      const inicial = coincidencia[0]
      const mayuscula = inicial === inicial.toUpperCase() && inicial !== inicial.toLowerCase()
      return mayuscula ? bien.charAt(0).toUpperCase() + bien.slice(1) : bien
    })
  }
  return resultado
}

// Limpia el nombre de un trabajo: recorta, colapsa espacios y corrige erratas.
export function normalizarNombre(valor) {
  if (esVacio(valor)) return ''
  const texto = String(valor).replace(/\s+/g, ' ').trim()
  return corregirErratas(texto)
}

// Convierte una celda de tiempo a minutos enteros. Admite texto «H:MM»/«HH:MM»,
// número de Excel (fracción de día) y Date. Devuelve null si no es un tiempo.
export function minutosDeCelda(valor) {
  if (valor instanceof Date) {
    const minutos = valor.getUTCHours() * 60 + valor.getUTCMinutes() + valor.getUTCSeconds() / 60
    return Math.round(minutos)
  }
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return null
    return Math.round(valor * 24 * 60)
  }
  if (typeof valor === 'string') {
    const coincidencia = valor.trim().match(/^(\d{1,3}):(\d{1,2})$/)
    if (!coincidencia) return null
    const minutos = Number(coincidencia[2])
    if (minutos > 59) return null
    return Number(coincidencia[1]) * 60 + minutos
  }
  return null
}

// Formatea una cantidad de minutos como «H:MM».
export function formatearMinutos(minutos) {
  const total = Math.max(0, Math.round(Number(minutos) || 0))
  const horas = Math.floor(total / 60)
  const min = String(total % 60).padStart(2, '0')
  return `${horas}:${min}`
}

// Prefijo de código de una categoría (fijo si se conoce; si no, 3 letras).
export function prefijoCategoria(categoria) {
  const clave = normalizarClave(categoria)
  if (PREFIJOS_CATEGORIA[clave]) return PREFIJOS_CATEGORIA[clave]
  return clave.replace(/[^a-z0-9]/g, '').slice(0, 3).toUpperCase()
}

// ¿Es una fila de tiempos? (columna A vacía y todos los valores de B..I son tiempos).
function esFilaTiempos(fila) {
  if (!esVacio(fila[0])) return false
  const valores = fila.slice(PRIMERA_COLUMNA, ULTIMA_COLUMNA + 1).filter((valor) => !esVacio(valor))
  if (valores.length === 0) return false
  return valores.every((valor) => minutosDeCelda(valor) !== null)
}

// ¿Está la fila completamente vacía? (separa bloques de categoría).
function esFilaVacia(fila) {
  if (!Array.isArray(fila)) return true
  return fila.every(esVacio)
}

// Interpreta las filas de la hoja y devuelve { trabajos, avisos }.
// Cada aviso es { motivo, nombre?, categoria? } (trabajos sin tiempos o celdas raras).
export function parsearTiemposTrabajos(filas) {
  const lista = Array.isArray(filas) ? filas : []
  const trabajos = []
  const avisos = []
  const ordenPorCategoria = new Map()
  let categoriaActual = null
  let grupo = null // Map columna -> { nombre, tiempos }

  // Cierra el grupo abierto: guarda sus trabajos y omite los que no tienen tiempos.
  function cerrarGrupo() {
    if (!grupo) return
    for (const trabajo of grupo.values()) {
      if (trabajo.tiempos.length === 0) {
        avisos.push({ motivo: 'trabajo sin tiempos', nombre: trabajo.nombre, categoria: categoriaActual })
        continue
      }
      const orden = ordenPorCategoria.get(categoriaActual) ?? 0
      ordenPorCategoria.set(categoriaActual, orden + 1)
      trabajos.push({
        categoria: categoriaActual,
        nombre: trabajo.nombre,
        tiempos: trabajo.tiempos,
        orden,
      })
    }
    grupo = null
  }

  for (const fila of lista) {
    // Fila vacía: cierra el grupo de trabajos, pero NO la categoría: una
    // cabecera sin nombre en A tras una fila vacía sigue en la misma categoría
    // (p. ej. el segundo bloque de «Ruedas» del Excel).
    if (esFilaVacia(fila)) {
      cerrarGrupo()
      continue
    }

    // Fila de tiempos: añade cada tiempo al trabajo de su columna.
    if (esFilaTiempos(fila)) {
      if (!grupo) {
        avisos.push({ motivo: 'fila de tiempos sin cabecera', categoria: categoriaActual })
        continue
      }
      for (let col = PRIMERA_COLUMNA; col <= ULTIMA_COLUMNA; col++) {
        const valor = fila[col]
        if (esVacio(valor)) continue
        const minutos = minutosDeCelda(valor)
        if (minutos === null) continue
        const trabajo = grupo.get(col)
        if (trabajo) trabajo.tiempos.push(minutos)
        else avisos.push({ motivo: 'tiempo sin trabajo', categoria: categoriaActual })
      }
      continue
    }

    // Fila de cabecera: nombre de categoría en A (o vacío) y trabajos en B..I.
    cerrarGrupo()
    const nombreCategoria = normalizarNombre(fila[0])
    if (nombreCategoria !== '') categoriaActual = nombreCategoria
    grupo = new Map()
    for (let col = PRIMERA_COLUMNA; col <= ULTIMA_COLUMNA; col++) {
      const nombre = normalizarNombre(fila[col])
      if (nombre !== '') grupo.set(col, { nombre, tiempos: [] })
    }
  }

  cerrarGrupo()
  return { trabajos, avisos }
}

// ¿El buffer empieza con la firma de un Excel? (.xlsx/.xlsm/.xlsb son ZIP y los
// .xls antiguos usan el formato OLE2). Evita que XLSX.read acepte cualquier texto.
function esCabeceraExcel(buffer) {
  if (!buffer || buffer.length < 4) return false
  const b = buffer
  if (b[0] === 0x50 && b[1] === 0x4b) return true // PK
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return true // OLE2
  return false
}

// Abre un .xlsx (primera hoja) y lo interpreta. Lanza si no es un Excel legible.
export function leerExcelTiempos(buffer) {
  if (!esCabeceraExcel(buffer)) throw new Error('El fichero no es un Excel válido')
  const libro = XLSX.read(buffer, { type: 'buffer' })
  const hoja = libro.Sheets[libro.SheetNames[0]]
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: null })
  return parsearTiemposTrabajos(filas)
}

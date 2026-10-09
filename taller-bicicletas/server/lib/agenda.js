// Lógica pura de la AGENDA de planificación de trabajos del taller: horarios
// por tramos, franjas horarias, semana laborable y resumen de ocupación.
// Módulo puro (sin Prisma ni Express), con pruebas en agenda.test.mjs.

// Configuración por defecto del taller: un tramo de 09:00 a 17:00 y un máximo
// de 5 horas de trabajo (aunque el horario sea más largo).
export const CONFIG_AGENDA_DEFECTO = {
  tramos: [{ inicio: '09:00', fin: '17:00' }],
  horasMaximas: 5,
}

const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

// Convierte «HH:MM» a minutos desde medianoche (0-1440) o null si no es válido:
// horas 00-24 (24:00 solo con minutos 0) y minutos múltiplos de 15.
export function minutosDeHora(texto) {
  if (typeof texto !== 'string') return null
  const coincidencia = /^(\d{2}):(\d{2})$/.exec(texto.trim())
  if (!coincidencia) return null
  const horas = Number(coincidencia[1])
  const minutos = Number(coincidencia[2])
  if (horas > 24 || minutos > 59) return null
  if (horas === 24 && minutos !== 0) return null
  if (minutos % 15 !== 0) return null
  return horas * 60 + minutos
}

// Formatea minutos desde medianoche como «HH:MM» (1440 -> «24:00»).
export function horaDeMinutos(minutos) {
  const horas = Math.floor(minutos / 60)
  const min = minutos % 60
  return `${String(horas).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

// Convierte «AAAA-MM-DD» (o un Date) al Date local del inicio del día, o null si
// el formato no es válido o la fecha no existe.
function fechaLocal(fecha) {
  if (fecha instanceof Date) {
    return Number.isNaN(fecha.getTime()) ? null : new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())
  }
  if (typeof fecha !== 'string') return null
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha.trim())
  if (!coincidencia) return null
  const anio = Number(coincidencia[1])
  const mes = Number(coincidencia[2])
  const dia = Number(coincidencia[3])
  const resultado = new Date(anio, mes - 1, dia)
  if (resultado.getFullYear() !== anio || resultado.getMonth() !== mes - 1 || resultado.getDate() !== dia) return null
  return resultado
}

// Formatea un Date como «AAAA-MM-DD» en hora local.
export function formatearFecha(fecha) {
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

// ¿La fecha «AAAA-MM-DD» (o Date) es válida y existe?
export function esFechaValida(fecha) {
  return fechaLocal(fecha) !== null
}

// Fecha de hoy en hora local como «AAAA-MM-DD».
export function hoyLocal() {
  return formatearFecha(new Date())
}

// Suma (o resta, con n negativo) días a una fecha «AAAA-MM-DD». Devuelve
// «AAAA-MM-DD» o null si la fecha de partida no es válida.
export function sumarDias(fecha, n) {
  const base = fechaLocal(fecha)
  if (!base) return null
  base.setDate(base.getDate() + n)
  return formatearFecha(base)
}

// Valida y normaliza los tramos del horario (array de 1 a 4 tramos ordenados por
// inicio, sin solapes). Devuelve { tramos } o { error }.
export function validarTramos(tramos) {
  if (!Array.isArray(tramos) || tramos.length < 1 || tramos.length > 4) {
    return { error: 'El horario debe tener entre 1 y 4 tramos' }
  }
  const normalizados = []
  for (const tramo of tramos) {
    if (!tramo || typeof tramo !== 'object') {
      return { error: 'Cada tramo debe indicar su hora de inicio y de fin' }
    }
    const inicio = minutosDeHora(tramo.inicio)
    const fin = minutosDeHora(tramo.fin)
    if (inicio === null || fin === null) {
      return { error: 'Las horas deben ser «HH:MM» en múltiplos de 15 minutos, entre 00:00 y 24:00' }
    }
    if (inicio >= fin) {
      return { error: 'El inicio de cada tramo debe ser anterior a su fin' }
    }
    normalizados.push({ inicio, fin })
  }
  normalizados.sort((a, b) => a.inicio - b.inicio)
  for (let i = 1; i < normalizados.length; i++) {
    if (normalizados[i].inicio < normalizados[i - 1].fin) {
      return { error: 'Los tramos del horario no pueden solaparse' }
    }
  }
  return { tramos: normalizados.map(({ inicio, fin }) => ({ inicio: horaDeMinutos(inicio), fin: horaDeMinutos(fin) })) }
}

// Valida las horas máximas de trabajo: número entre 0 y 24 con hasta 2 decimales.
// Devuelve { horasMaximas } o { error }.
export function validarHorasMaximas(valor) {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    return { error: 'Las horas máximas deben ser un número' }
  }
  if (valor < 0 || valor > 24) {
    return { error: 'Las horas máximas deben estar entre 0 y 24' }
  }
  return { horasMaximas: Math.round(valor * 100) / 100 }
}

// Filas de la agenda: desde el inicio de cada tramo, filas de 60 minutos (la
// última, si no llega a 60, se acorta). Devuelve [{ hora, minutos }].
export function franjasDeTramos(tramos) {
  const franjas = []
  for (const { inicio, fin } of tramos) {
    const ini = minutosDeHora(inicio)
    const limite = minutosDeHora(fin)
    for (let minuto = ini; minuto < limite; minuto += 60) {
      franjas.push({ hora: horaDeMinutos(minuto), minutos: Math.min(60, limite - minuto) })
    }
  }
  return franjas
}

// Total de minutos cubiertos por los tramos del horario.
export function minutosLaborables(tramos) {
  return tramos.reduce((total, { inicio, fin }) => total + (minutosDeHora(fin) - minutosDeHora(inicio)), 0)
}

// Las 5 fechas «AAAA-MM-DD» de lunes a viernes de la semana que contiene la
// fecha (en hora local). Si cae en sábado o domingo, la semana empieza el lunes
// anterior. Devuelve null si la fecha no es válida.
export function semanaLaborable(fecha) {
  const base = fechaLocal(fecha)
  if (!base) return null
  const desplazamiento = (base.getDay() + 6) % 7 // lunes = 0 ... domingo = 6
  const lunes = new Date(base.getFullYear(), base.getMonth(), base.getDate() - desplazamiento)
  const dias = []
  for (let i = 0; i < 5; i++) {
    dias.push(formatearFecha(new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i)))
  }
  return dias
}

// ¿La fecha es un día laborable (de lunes a viernes)?
export function esLaborable(fecha) {
  const base = fechaLocal(fecha)
  if (!base) return false
  const dia = base.getDay()
  return dia >= 1 && dia <= 5
}

// Nombre del día de la semana («Lunes»...«Domingo») o null si la fecha no existe.
export function nombreDia(fecha) {
  const base = fechaLocal(fecha)
  return base ? NOMBRES_DIA[base.getDay()] : null
}

// Resumen de ocupación de un día: minutos laborables del horario, máximo de
// trabajo, minutos ocupados por los trabajos, minutos libres (puede ser
// negativo), aviso de exceso, minutos ocupados por franja y trabajos cuya hora
// queda fuera de las franjas del día.
export function resumenDia({ trabajos, tramos, horasMaximas }) {
  const franjas = franjasDeTramos(tramos)
  const porFranja = {}
  for (const franja of franjas) porFranja[franja.hora] = 0

  let ocupadoMin = 0
  const fueraDeHorario = []
  for (const trabajo of trabajos ?? []) {
    const minutos = Number(trabajo.minutos) || 0
    ocupadoMin += minutos
    if (Object.prototype.hasOwnProperty.call(porFranja, trabajo.hora)) {
      porFranja[trabajo.hora] += minutos
    } else {
      fueraDeHorario.push(trabajo.id)
    }
  }

  const maximoMin = Math.round(horasMaximas * 60)
  return {
    laborablesMin: minutosLaborables(tramos),
    maximoMin,
    ocupadoMin,
    libreMin: maximoMin - ocupadoMin,
    excedido: ocupadoMin > maximoMin,
    porFranja,
    fueraDeHorario,
  }
}

# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado semántico.

Versiones anteriores: ver el historial de git.

## [Sin publicar]

## [1.15.0] - 2026-10-09

### Añadido

- Agenda con línea de tiempo: cada trabajo se dibuja con su hora de inicio y su duración (escala de unos 1,1 px por minuto), sin filas por hora ni huecos; las pausas del horario se ven rayadas y un trabajo que las cruza se parte visualmente. Línea de «ahora» en el día de hoy.
- Selector de agenda por mecánico («Sin asignar» incluido), guardado en la dirección (`?mecanico=`).
- Un clic en una zona libre abre el selector de trabajo en esa hora (redondeada a 15 min), con trabajo del catálogo o trabajo libre y cliente opcional.
- Arrastrar un bloque a otra hora u otro día lo mueve y desplaza a los de detrás.
- Aviso «El día se pasa» al superar el límite del día: forzar el día, pasar lo que falta al día siguiente (el trabajo se parte «1/2» y «2/2») o cancelar.
- Detalle del trabajo: duración, nota, cliente, mecánico, fecha, hora, quitar y ver la orden.
- En el móvil, lista por día con la hora de inicio y fin de cada trabajo.

### Cambiado

- Sustituye a la agenda por filas de hora de la 1.13 (desaparecen la tarjeta del trabajo y el modal «Mover»).

## [1.14.0] - 2026-10-09

### Añadido

- Agenda por mecánico: cada trabajo es ahora uno o varios bloques con hora de inicio y duración reales (una línea de tiempo, sin filas por hora), en la agenda de un mecánico o en «Sin asignar».
- Planificador (`server/lib/planificador.js`): insertar desplaza a los trabajos de detrás, un trabajo puede cruzar horas y pausas, y si el día se llena se pregunta si forzarlo o pasar lo que falta al día siguiente (el trabajo se parte «1/2» y «2/2»).
- API: `GET /semana?mecanico=`, trabajos libres o del catálogo con cliente y mecánico, respuesta 409 con `requiereDecision` y parámetro `desborde`; ajuste `autoPlanificar` en la configuración.
- Esquema: cierres de día (festivo y vacaciones) y horario y horas máximas propios de cada mecánico (aún sin interfaz).

### Cambiado

- Los trabajos de la agenda v1.13 se convierten solos en bloques al arrancar el servidor (migración idempotente). Los campos antiguos `fecha`, `hora` y `posicion` de `AgendaTrabajo` quedan obsoletos.
- La interfaz de la Agenda actual no es compatible con esta API; se rehace en la 1.15.0.

## [1.13.2] - 2026-10-09

### Corregido

- Agenda: los trabajos con varios tiempos (p. ej. «Desmontar/montar bici», 3/4/5 h) no se podían programar porque el selector se cerraba al elegirlos, antes de poder escoger el tiempo.

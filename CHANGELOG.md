# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado semántico.

Versiones anteriores: ver el historial de git.

## [Sin publicar]

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

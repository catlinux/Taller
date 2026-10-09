# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado semántico.

Versiones anteriores: ver el historial de git.

## [Sin publicar]

### Añadido

- Agenda (interno, aún sin usar): esquema con bloques de trabajo con hora de inicio, mecánico, cliente y orden, cierres de día (festivo y vacaciones) y horario propio por mecánico; planificador puro (`server/lib/planificador.js`) y migración de los trabajos de la agenda v1.13 a bloques.

## [1.13.2] - 2026-10-09

### Corregido

- Agenda: los trabajos con varios tiempos (p. ej. «Desmontar/montar bici», 3/4/5 h) no se podían programar porque el selector se cerraba al elegirlos, antes de poder escoger el tiempo.

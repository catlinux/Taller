# Agenda por mecánico con línea de tiempo y planificación automática

Plan para rehacer la Agenda (v1.13.1) del taller. Se ejecuta por pasos en orden; cada paso es autocontenido. Marca `[x]` al terminar un paso y anota aquí cualquier imprevisto de diseño en «Incidencias» en lugar de improvisar.

Proyecto: `taller-bicicletas/` (Express + Prisma/SQLite en `server/`, React + Vite + Tailwind en `src/`). Lee `AGENTS.md` y la memoria del proyecto antes de empezar. Pruebas: `npm test` (lista explícita en `package.json`: añade allí cada `*.test.mjs` nuevo).

## Decisiones del usuario (no reabrir)

1. **Línea de tiempo real**: cada trabajo tiene hora de inicio y duración; se acaban las filas por hora y los huecos vacíos.
2. **Insertar desplaza (opción A)**: un trabajo puesto en un momento ocupado entra justo después del trabajo en curso y empuja a los de detrás.
3. **Una hora llena no admite más**: el trabajo siguiente empieza donde acaba el anterior; un trabajo puede cruzar horas y pausas (un solo bloque).
4. **Final del día**: si al añadir o mover se supera el límite del día, se pregunta **«Forzar el día»** (se queda, en rojo) o **«Pasar lo que falta al día siguiente»** (se parte en «1/2» y «2/2»).
5. **Agenda por mecánico** (son 2) más una agenda **«Sin asignar»**. Cada mecánico puede tener horario y horas máximas propios; si no, los del taller.
6. **Planificación automática desde la orden**: al añadir mano de obra a una orden, el trabajo entra solo en la agenda del mecánico de la orden (o «Sin asignar»), en el primer hueco a partir de la **fecha de entrada** (si es hoy, a partir de ahora), con el **tiempo de la línea de la orden**.
7. **Cliente**: el trabajo muestra nombre y primer apellido del cliente; desde la agenda también se puede elegir cliente.
8. Los trabajos programados se pueden **mover y editar** (arrastrar, duración, nota, cliente, mecánico).
9. **Festivos y vacaciones**: el calendario no está ni estará sincronizado con uno real, así que se pueden marcar días de lunes a viernes como **Festivo** o **Vacaciones**: uno a uno o por periodo, de una fecha a otra. Un día cerrado no tiene capacidad. El cierre es del taller, común a todos los mecánicos.

## Diseño

### Modelo de datos (`prisma/schema.prisma`, solo cambios sin pérdida de datos)

- `AgendaTrabajo` (el trabajo) añade:
  - `mecanicoId Int?`, con relación a `Mecanico` y `onDelete: SetNull`. `null` = «Sin asignar».
  - `clienteId Int?`, con relación a `Cliente` y `onDelete: SetNull`.
  - `ordenId Int?`, con relación a `OrdenReparacion` y `onDelete: Cascade`.
  - `ordenManoObraId Int?`, con relación a `OrdenManoObra` y `onDelete: Cascade`.
  - `@@index([mecanicoId])` y `@@index([ordenId])`.
  - `minutos` pasa a ser la **duración total**. `fecha`, `hora` y `posicion` quedan **OBSOLETOS**: se conservan (comentario `OBSOLETO`, como `estadoPago`) y dejan de usarse; las fechas reales están en los bloques.
- **Nuevo `AgendaBloque`** (un trozo del trabajo dentro de un día):
  - Campos: `id`, `trabajoId Int` (relación con `AgendaTrabajo`, `onDelete: Cascade`), `fecha String` («AAAA-MM-DD»), `inicio Int` (minutos desde medianoche, en la hora del reloj), `minutos Int` (minutos **de trabajo**: no cuentan las pausas), `forzado Boolean @default(false)` y `@@index([fecha])`.
  - Un trabajo sin partir tiene 1 bloque; uno partido entre días tiene uno por día. La suma de `minutos` de los bloques es `AgendaTrabajo.minutos`.
- `AgendaDia` añade `cierre String?` (`'festivo'` | `'vacaciones'`; `null` = abierto) y `motivo String?` (p. ej. «Fiesta mayor»). La fila se borra solo cuando no quedan ni tramos, ni horas, ni cierre.
- `Mecanico` añade `agendaTramos String?` (JSON) y `agendaHorasMaximas Float?` (paso 7).
- La cola de un mecánico en un día está formada por todos los bloques de ese día cuyos trabajos tienen ese `mecanicoId`.
- El calendario de un mecánico en un día se toma por este orden de precedencia: `AgendaDia` (ajuste del día, común a todos) > valores propios del `Mecanico` > configuración general (`Ajuste 'agenda'`). Solo cuentan los días de lunes a viernes.

Tras cambiar el esquema: `npx prisma db push --skip-generate` y `npx prisma generate`, **sobre una copia de la base**. El despliegue (`deploy/update.sh` y Docker) ya ejecuta `prisma db push`.

### Coordenadas

En cada día se trabaja en **desplazamiento laborable**: los minutos de trabajo que hay desde el inicio del primer tramo, saltando las pausas.

- `L` = total de minutos laborables del horario del día.
- `C = min(maxMin, L)` = capacidad del día.
- Un bloque ocupa `[d, d + minutos)` en desplazamiento y nunca se solapa con otro de la misma cola.
- Conversiones:
  - `aDesplazamiento(tramos, reloj)`: un reloj que cae en una pausa equivale al inicio del tramo siguiente.
  - `aReloj(tramos, desplazamiento)`.
  - Un bloque que cruza una pausa sigue siendo **un solo bloque**; la interfaz lo dibuja en dos trozos visuales.

### Planificador (módulo puro `server/lib/planificador.js`, con pruebas)

Recibe `calendario(fecha) -> { tramos, maxMin, cerrado }` (un día cerrado se comporta como `L = 0` y `C = 0`) y los bloques de la cola agrupados por fecha. Devuelve los cambios que hay que aplicar: `{ crear, actualizar, borrar }`, o bien `{ requiereDecision: true, excesoMin, fecha }`. Nunca toca la base de datos.

**Insertar** (`insertar`): trabajo de `N` min en `(fecha, desplazamiento x)` con `desborde ∈ { null, 'forzar', 'siguiente' }`.

1. **Ajuste del punto**: si `x` cae estrictamente dentro de un bloque, `x` pasa al final de ese bloque.
2. **Colocación y empuje**: se coloca el bloque nuevo en `x`. Los siguientes se empujan en cascada:
   - `cursor = fin del nuevo`.
   - Para cada bloque posterior, en orden: si `inicio < cursor`, `inicio = cursor` y `cursor = su fin`. Si no, la cascada se detiene y los huecos que haya más adelante se conservan.
3. **Exceso del día**: se recorren los bloques en orden acumulando minutos.
   - Exceso de capacidad: lo que pase de `C`.
   - Exceso de horario: lo que pase de `L` en posición.
   - Si hay exceso y `desborde = null`, se devuelve `requiereDecision` con los minutos de exceso **sin cambiar nada**.
4. **`forzar`**: lo que pasa de `C` se queda en el día y su bloque lleva `forzado = true`. Lo que pasa de `L` **siempre** se lleva al día siguiente, como en `siguiente`.
5. **`siguiente`**: el bloque que cruza el límite se parte. El sobrante, y todos los bloques posteriores del día, se insertan **al principio** (desplazamiento 0) del siguiente día laborable, en el mismo orden. Esa inserción desplaza la cola de ese día y se repite en cascada con `siguiente`.
   - Los trozos de un mismo trabajo que queden contiguos en el mismo día se fusionan.
   - Los días con `C = 0` se saltan.
   - Límite de seguridad: 260 días laborables, después error.

**Primer hueco** (`primerHueco`), para la planificación automática: `N` min desde `(fecha, desplazamiento mínimo)`. Nunca fuerza.

- En cada día, los huecos candidatos son:
  - los huecos libres donde **cabe entero** lo que queda;
  - **el último hueco del día** (hasta `L`), limitado por la capacidad que quede (`C − ocupado`).
- Se usa el primer candidato y lo que no cabe pasa al día siguiente.
- Así un trabajo solo se parte entre días, nunca dentro de un mismo día.

**Redimensionar**:

- Si la duración crece, se alarga el último bloque y se empuja como en «insertar» (mismo protocolo de `desborde`).
- Si decrece, se recorta desde los últimos bloques y se borran los que se quedan a 0. Nunca se adelantan otros trabajos.

**Mover**: se quitan todos los bloques del trabajo y se vuelve a insertar en el destino con la duración total.

**Quitar**: se borran sus bloques, sin compactar.

**Casos de prueba obligatorios.** Horario 09:00–13:00 y 15:00–17:00 (`L = 360`), máximo 5 h (`C = 300`), salvo que se indique otro:

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Tres de 20 min a las 09:00, uno tras otro | 09:00, 09:20 y 09:40 |
| 2 | Otro de 20 min con clic a las 09:10 | Entra a las 09:20 y empuja: 09:40 y 10:00 |
| 3 | Dos de 15 min a las 09:00 y 09:15; uno de 60 min a las 09:30 | Un bloque, de 09:30 a 10:30 |
| 4 | Uno de 60 min a las 12:30 | Un bloque; fin de reloj 15:30 |
| 5 | Día ocupado 4:30 seguidas desde las 09:00; añadir 60 min al final, sin `desborde` | `requiereDecision`, `excesoMin = 30`, nada cambia |
| 6 | El caso 5 con `siguiente` | 30 min hoy y 30 min al día siguiente a las 09:00 (partes 1/2 y 2/2); la cola de mañana se desplaza 30 min |
| 7 | El caso 6 en viernes | La parte 2/2 cae el lunes |
| 8 | El caso 5 con `forzar` | Un bloque de 60 min con `forzado = true` |
| 9 | `forzar` cuando se pasa de `L` | Lo que pasa de las 17:00 va al día siguiente |
| 10 | Cascada: el día siguiente también está lleno | Lo sobrante sigue al tercer día |
| 11 | `primerHueco` hoy a las 11:07 | Empieza buscando a las 11:15 (redondeo hacia arriba a 15 min) |
| 12 | `primerHueco` con un hueco de 20 min a las 10:00 y un trabajo de 45 min | Salta ese hueco y usa el siguiente donde cabe entero o el final del día |
| 13 | Redimensionar | Crecer empuja; decrecer recorta el último bloque y borra los que se quedan a 0 |
| 14 | Día con `maxMin = 0` | Se salta en `siguiente` y en `primerHueco` |
| 15 | Día cerrado (festivo o vacaciones) | Se salta en `siguiente` y en `primerHueco`; `insertar` directamente en él da error («El día está cerrado: festivo») |
| 16 | `vaciarDia(fecha)` | Sus bloques pasan, en orden, al principio del siguiente día abierto con `siguiente` y en cascada (para cerrar un día que ya tiene trabajos) |

### API (`server/routes/agenda.js`)

- `GET /semana?fecha=&mecanico=<id|sin>`: los 5 días del mecánico. Cada día lleva `fecha`, `nombre`, `esHoy`, `tramos`, `laborablesMin`, `maximoMin`, `ocupadoMin`, `excedido`, `tramosPersonalizados`, `horasPersonalizadas` y `bloques`. Cada bloque:
  `{ id, trabajoId, inicio:'HH:MM', fin:'HH:MM', minutos, parte, partes, forzado, trabajo:{ id, codigo, descripcion, categoria, tiempos, minutos, nota, mecanicoId, cliente:{ id, nombreCorto }|null, orden:{ id, numeroOrden }|null } }`.
  `nombreCorto` = `nombre` + primera palabra de `apellidos`.
- `POST /trabajos { mecanicoId|null, fecha, inicio:'HH:MM', operacionId?, descripcion?, minutos?, nota?, clienteId?, desborde? }`:
  - Hace falta `operacionId` o `descripcion` (trabajo libre).
  - Responde 201 con el trabajo, o **409** con `{ requiereDecision: true, excesoMin, fecha }` para que la interfaz pregunte y repita la petición con `desborde`.
- `PUT /trabajos/:id { fecha?, inicio?, mecanicoId?, minutos?, nota?, clienteId?, desborde? }`: mover, cambiar de mecánico o redimensionar, con el mismo protocolo 409.
- `DELETE /trabajos/:id`: quita el trabajo entero.
- `PUT|DELETE /dias/:fecha` y `GET|PUT /config`: sin cambios, salvo `config.autoPlanificar` (booleano, `true` por defecto; paso 6).
- Cierres (paso 5, admin):
  - `PUT /dias/:fecha { cierre: 'festivo'|'vacaciones'|null, motivo?, trabajos?: 'mover'|'mantener' }`.
  - `PUT /cierres { desde, hasta, cierre, motivo?, trabajos? }`: periodo, solo de lunes a viernes, como máximo 60 días.
  - Si los días que se cierran tienen bloques y falta `trabajos`, se responde **409** `{ requiereDecision: 'trabajosEnDiaCerrado', trabajos: n, dias: [...] }`.
  - Con `mover`: `vaciarDia` en todas las colas.
  - Con `mantener`: se quedan y se muestran en rojo («día cerrado»).
  - `GET /semana` añade a cada día `cierre` y `motivo`.
- Todo cambio de bloques se hace en `prisma.$transaction`, cargando los bloques de la cola desde la fecha afectada en adelante.

### Datos existentes

Migración idempotente al arrancar el servidor (`server/lib/agendaMigracion.js`, llamada desde `server/index.js`, con pruebas):

- A cada `AgendaTrabajo` sin bloques se le crea uno en `fecha` con `inicio = hora + suma de minutos de los anteriores en la misma (fecha, hora) por posicion`, y `mecanicoId` queda en `null`.
- Después, en cada día con solapes, se empujan en cascada (sin pasar al día siguiente).

## Pasos

Restricciones de **toda** tarea delegada con AgentRelay (copiarlas literalmente en `constraints`):

- PROHIBIDO usar comandos de git que modifiquen algo (commit, add, reset, checkout, merge, pull, fetch, branch, stash, gc, clean, rebase, push, update-index); solo `git status`, `git diff` y `git log`.
- No tocar `prisma/*.db`, `.env`, `data/`, `datos-importar/` ni `docs/import/`.
- `prisma db push` solo contra una copia temporal de la base (`DATABASE_URL` a la copia).
- Pruebas manuales con una COPIA temporal de `prisma/demo.db` o `dev.db` en otro puerto (no el 3001).
- No parar los servidores en marcha. Sin dependencias nuevas.

Tras cada ejecución, el orquestador comprueba `git log`, `git branch -a`, `git stash list` y `git status`, lee el diff, ejecuta `npm test` y `npm run build` y comprueba la interfaz con capturas (Edge headless) sobre la copia. Después hace commit con la versión y la entrada de `CHANGELOG.md` del paso.

### [x] Paso 1: corregir VAR-06 (1.13.2, parche)

- **Fallo**: en la agenda, algunos trabajos con varios tiempos (p. ej. VAR-06, «Desmontar/montar bici», tiempos 180/240/300) no se dejan programar.
  - El servidor acepta hasta 1440 min, así que el fallo está por confirmar.
  - Hay que reproducirlo en el navegador con una copia de la base: elegir VAR-06 en el selector, elegir un tiempo y ver el error o el comportamiento real.
  - Sospechosos: `src/components/agenda/SelectorTrabajo.jsx` (vista «elige el tiempo», posición del panel y eventos `mousedown`/`click`) y `src/pages/Agenda.jsx`.
  - Comprobar también VAR-01 (10/45) y el mismo flujo en la orden (`TablaManoObra.jsx`).
- Crear `CHANGELOG.md` en la raíz del repo (Keep a Changelog) con la entrada 1.13.2 y la nota «Versiones anteriores: ver el historial de git».
- **Terminado cuando**: VAR-06 y VAR-01 se programan con cada uno de sus tiempos (captura), con prueba de la causa si es lógica pura, y `npm test` y `npm run build` en verde.
- **Ejecutor**: AgentRelay, esfuerzo medio. Si no se reproduce en local, se pide al usuario el mensaje de error que ve.

### [x] Paso 2: modelo de datos y planificador puro (sin publicar)

- **Archivos**:
  - `prisma/schema.prisma`
  - `server/lib/planificador.js` y `server/lib/planificador.test.mjs` (los 16 casos de arriba y los que hagan falta)
  - `server/lib/agendaMigracion.js` y su prueba
  - `package.json` (lista de pruebas)
- **Terminado cuando**: el esquema queda aplicado en una copia, `npm test` está en verde con todos los casos y las funciones están documentadas en una línea cada una.
- **Ejecutor**: sesión Sonnet, esfuerzo alto, **sin delegar** (es la lógica delicada; el ejecutor barato falla en algoritmos así). Alternativa: AgentRelay con `effort: high` y revisión línea a línea.
- `CHANGELOG.md`: entrada en `[Sin publicar]`.

### [x] Paso 3: API de la agenda por mecánico (1.14.0, menor)

- **Archivos**: `server/routes/agenda.js`, `server/index.js` (llamada a la migración) y `server/lib/agenda.js` (cálculo de calendario y ocupación por cola si hace falta).
- Implementar el contrato de «API» de arriba usando `planificador.js`.
- La interfaz actual dejará de funcionar entre este paso y el 4: no publicar (no hacer push) hasta terminar el paso 4, o hacer los dos seguidos.
- **Terminado cuando**: hay pruebas reales contra la API sobre una copia (crear, el 409, `forzar`, `siguiente`, mover, redimensionar, quitar, `mecanico=sin`), la migración convierte datos v1.13 y `npm test` está en verde.
- **Ejecutor**: AgentRelay, esfuerzo alto (2 tareas: GET y migración; POST, PUT y DELETE).

### [ ] Paso 4: interfaz de línea de tiempo (1.15.0, menor)

Partido en dos tareas.

**4a. Vista**:

- Selector de mecánico arriba (botones: cada mecánico activo y «Sin asignar»), guardado en la URL `?mecanico=`.
- Columnas de lunes a viernes con un eje de horas común (de la hora más temprana a la más tardía de los 5 días; lo que no es horario de cada día, rayado).
- Escala de unos 1,1 px/min. Bloques en posición absoluta, partidos visualmente en las pausas con una función pura `segmentosVisuales(tramos, inicioMin, minutos)` en `src/lib/agenda.js`, con prueba.
- Contenido del bloque: descripción, cliente corto, número de orden (enlace), duración y «1/2». Los bloques de menos de 25 px van en una sola línea, con `title` completo.
- Colores: de una orden en azul, manuales en gris, `forzado` con borde rojo.
- Línea de «ahora» en el día de hoy. Cabecera con la ocupación, como ahora.
- En el móvil: lista por día con «09:00–09:30».
- Archivos: `src/pages/Agenda.jsx`, `src/components/agenda/ColumnaDia.jsx` (nuevo), `src/components/agenda/BloqueTrabajo.jsx` (sustituye a `TarjetaTrabajo.jsx`) y `src/lib/agenda.js` con su prueba.

**4b. Acciones**:

- Un clic en una zona libre abre `SelectorTrabajo` en la hora del clic (redondeada a 15 min), con campo opcional **Cliente** (buscador de clientes como el de las órdenes) y trabajo libre si no se elige ninguno del catálogo.
- Arrastrar un bloque a otra hora u otro día hace `PUT { fecha, inicio }`.
- Un 409 abre `ModalDesborde`: «Forzar el día», «Pasar lo que falta al día siguiente» y «Cancelar», con los minutos de exceso.
- Un clic en un bloque abre `ModalTrabajo`: duración, nota, cliente, mecánico, fecha y hora, «Quitar» y «Ver orden».
- Archivos: `src/components/agenda/SelectorTrabajo.jsx`, `ModalDesborde.jsx` y `ModalTrabajo.jsx` (nuevos), y `src/pages/Agenda.jsx`.

- **Terminado cuando**: hay capturas de la semana sin huecos, de un trabajo que cruza la pausa, del modal de desborde, de un trabajo partido 1/2–2/2 y de la vista en el móvil, y `npm test` y `npm run build` están en verde.
- **Ejecutor**: AgentRelay, esfuerzo alto. Cada tarea toca como máximo 4 archivos.

### [ ] Paso 5: festivos y vacaciones (1.16.0, menor)

- **Servidor** (`server/routes/agenda.js` y cálculo del calendario): el contrato de «Cierres» de la API. El calendario devuelve `cerrado` y el planificador ya lo respeta desde el paso 2.
- **Interfaz**:
  - En el modal «Ajustar día» (`AjusteDiaModal.jsx`): selector «Abierto / Festivo / Vacaciones» y motivo.
  - En Configuración > Agenda: «Cerrar un periodo» (desde, hasta, tipo y motivo) y lista de los próximos cierres, cada uno con «Reabrir».
  - En la semana, el día cerrado se ve gris y rayado, con la etiqueta «Festivo · motivo» o «Vacaciones», y no admite clics para añadir.
  - El 409 de «trabajosEnDiaCerrado» pregunta «Pasar los N trabajos al siguiente día abierto» o «Dejarlos».
- **Terminado cuando**: hay capturas de un festivo y de una semana de vacaciones; las pruebas de API comprueban que la planificación salta los días cerrados y que cerrar un día con trabajos los mueve; `npm test` en verde.
- **Ejecutor**: AgentRelay, esfuerzo medio (2 tareas: servidor e interfaz).

### [ ] Paso 6: planificación automática desde las órdenes (1.17.0, menor)

- **Archivos**:
  - `server/lib/agendaOrdenes.js` (nuevo, con Prisma): `planificarLinea(tx, linea, orden)`, `sincronizarLinea(tx, linea)` y `replanificarOrden(tx, ordenId)`.
  - `server/routes/ordenes.js`, `server/lib/papelera.js`, `server/routes/agenda.js` (config `autoPlanificar` y `GET /orden/:id` → planificación por línea).
  - `src/components/orden/TablaManoObra.jsx` y Configuración > Agenda (casilla).
- **Reglas**:
  - **Alta de línea** (`POST /:id/mano-obra`, alta de orden con `manoObra` y duplicar): si `autoPlanificar` está activo, la línea tiene `tiempo > 0` y la orden no está Finalizada ni Entregada, se usa `primerHueco` en la cola de `orden.mecanicoId` (o «Sin asignar») desde `max(fechaEntrada, hoy)`, y desde la hora actual si es hoy.
    - `minutos = round(tiempo × 60)`.
    - El trabajo copia `codigoOp`, `descripcion`, `clienteId`, `ordenId` y `ordenManoObraId`.
  - **Edición de línea**: si cambia `tiempo`, se redimensiona con `desborde = 'siguiente'`; si cambia la descripción o el código, se copian.
  - **Borrado de línea u orden**: los bloques se van por cascada. Al **restaurar** desde la papelera, se vuelve a planificar como un alta.
  - **Cambio de mecánico de la orden**: los trabajos de la orden con bloques desde hoy se quitan y se replanifican en la cola nueva.
  - Mover o editar en la agenda **no** cambia la orden (la agenda solo planifica).
  - Errores del planificador: no deben impedir guardar la orden. Se registran y la línea queda «Sin planificar».
- **Interfaz de la orden**: cada línea de mano de obra muestra «En agenda: mar 14/10 10:30» (enlace a la semana) o «Sin planificar» con un botón **Planificar**.
- **Terminado cuando**: hay pruebas reales contra la API (alta, edición, borrado, cambio de mecánico, fecha de entrada futura, orden de hoy por la tarde), capturas y `npm test` en verde.
- **Ejecutor**: AgentRelay, esfuerzo alto (2 tareas: servidor e interfaz).

### [ ] Paso 7: horario por mecánico (1.18.0, menor)

- Campos `agendaTramos` y `agendaHorasMaximas` en `Mecanico`, editables en Configuración > Mecánicos con `EditorTramos.jsx`. Vacíos = los del taller.
- El calendario aplica la precedencia del diseño.
- **Terminado cuando**: un mecánico con 09:00–14:00 ve su semana con ese horario y la planificación lo respeta (prueba de API).
- **Ejecutor**: AgentRelay, esfuerzo medio.

## Fuera de alcance (anotar en TODO.md)

- Vista «Todos» con los dos mecánicos en columnas para un día.
- Ajuste de día por mecánico (ahora el ajuste de día es común).
- Vacaciones o ausencias de un solo mecánico (ahora el cierre es de todo el taller).
- Sincronizar con un calendario real de festivos.
- Botón «Compactar día» para cerrar huecos.
- Pasar a la orden el tiempo cambiado en la agenda.

## Incidencias

(vacío)

# Aplicación de taller de bicicletas

## Qué es (y qué no es)

Aplicación propia del taller de un taller de bicicletas para **controlar las reparaciones**: órdenes de trabajo, presupuestos, clientes, bicicletas, piezas utilizadas, mano de obra y el historial de cada bici. Debe ser sencilla, intuitiva, rápida y ampliable.

**No es un programa de facturación ni un ERP.** El taller sigue usando su ERP actual para facturar y llevar el stock. De ahí salen los listados de clientes y artículos que importamos (`datos-importar/`, fuera de git). En consecuencia:

- El catálogo de artículos es una referencia para rellenar las órdenes. Se reimporta cuando haga falta y **no se descuenta stock** al usarlo en una orden (el stock es solo informativo).
- No hay facturas, ni series de facturación, ni ingresos en el panel principal.
- La forma de pago y el estado de pago se guardan como **información interna** de la orden, nunca impresa.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Precios de artículos | El precio de venta del catálogo es **sin IVA**. El IVA se aplica por línea (por defecto 21 %). |
| Precio por hora | 30 € por defecto (editable en cada operación y en cada línea). |
| Tipos de reparación | Preferente (viajeros/corredores), Programada, Urgente, No programada. Valores internos: `Preferente`, `Programada`, `Urgente`, `NoProgramada`. |
| Categorías de bici | 14 tipos sin subcategorías: BiciInfantil, XC, Trail, Enduro, Descens, Passeig, Gravel, Carretera, Triatlo, EBikePasseig, EBikeXC, EBikeEnduro, EBikeGravel, EBikeCarretera. |
| Historial | Nunca se pierde. No se puede borrar un cliente ni una bicicleta que tengan órdenes. |
| Usuarios | `admin` (todo) y `mecanico` (trabajo diario, sin usuarios ni copias). Cada orden puede tener un mecánico asignado. |

## Estilo visual

- Modo oscuro con **fondo gris antracita**, detalles en **azul** (acciones, enlaces, foco) y **naranja** (avisos, estados que requieren atención, totales).
- Diseño limpio y técnico. Optimizado para **ordenador y tablet**: botones y campos amplios (mínimo 44 px de alto en táctil) y formularios claros.
- Textos de la interfaz en español.

## La orden de reparación (núcleo de la aplicación)

Pantalla completa con el aspecto del documento, no un modal. Secciones:

1. **Cabecera**
   - Número de orden: automático, `ORD-AAAA-NNNN`.
   - Fecha y hora de entrada.
   - Fecha prevista de entrega.
   - Estado: Presupuesto, Pendiente, En reparación, Esperando material, Finalizada o Entregada.
   - **Tipo de reparación.**
   - **Garantía** (sí o no).
   - **Mecánico asignado.**
2. **Cliente**
   - Buscador automático al escribir el número de cliente, parte del nombre, el teléfono o el DNI.
   - Alta rápida si no existe.
   - Muestra los datos del cliente: nº, nombre, apellidos, DNI, dirección, CP, población, provincia, móvil y correo.
3. **Bicicleta**
   - Se elige entre las bicis del cliente o se da de alta al momento.
   - Datos: tipo, marca, modelo y número de serie (el "material entregado").
4. **Problema.** Lo que el cliente dice que le pasa a la bici. Se imprime.
5. **Materiales utilizados.** Tabla editable con estas columnas:
   - Referencia
   - Descripción
   - Cantidad
   - Precio unitario
   - Descuento %
   - Precio neto
   - IVA %
   - Importe total

   Al escribir la referencia o la descripción busca en el catálogo y rellena la descripción, el precio y el IVA. Todo sigue siendo editable a mano.
6. **Mano de obra.** Tabla independiente con estas columnas:
   - Código de operación
   - Descripción
   - Tiempo (horas)
   - Precio por hora
   - Importe

   Autocompleta desde el catálogo de operaciones: cambio de cadena, purgado de frenos, centrado de rueda, ajuste de cambio, sustitución de neumático, etc.
7. **Descripción de los trabajos.** Textos largos con trabajos realizados, diagnóstico y recomendaciones. Se imprime.
8. **Totales automáticos**
   - Subtotal de materiales
   - Subtotal de mano de obra
   - Descuento global %
   - Base imponible
   - IVA
   - Total

   El servidor es la fuente de verdad. La pantalla los muestra al momento.
9. **Observaciones internas (no se imprimen ni las ve el cliente)**
   - Forma de pago: Efectivo, Tarjeta, Transferencia o Financiado.
   - Estado de pago: Pagado, Pendiente o Parcial.
   - Texto libre de observaciones.
10. **Seguimiento (interno, no se imprime)**
    - Texto libre: cliente avisado, falta pedir un dato o una pieza, etc.
    - Casilla rápida **"Cliente avisado"**.

Acciones de la orden:
- Guardar.
- Cambiar de estado.
- **Duplicar** (crea una orden nueva en estado Presupuesto con las mismas líneas).
- **Imprimir o generar PDF**:
  - El título es "PRESUPUESTO" si el estado es Presupuesto y "PARTE DE TALLER" en los demás.
  - Incluye logo y datos de empresa, cliente, bici, problema, materiales, mano de obra, trabajos, totales y una casilla de "Conforme cliente".
  - Lleva al pie la cláusula de protección de datos (configurable en Empresa).
  - Nunca incluye las observaciones internas ni el seguimiento.

## Pantallas

- **Taller (inicio).** Tablero por estado con el número de órdenes de cada uno. Resalta las órdenes con la fecha prevista vencida y las finalizadas sin cliente avisado. Desde ahí se abre cada orden.
- **Órdenes.** Listado con búsqueda (número, cliente, bici), filtros por estado, tipo y mecánico, y paginación. Botón "Nueva orden".
- **Clientes.** Listado, búsqueda y ficha con sus bicis y su **historial de reparaciones**.
- **Bicicletas.** Listado, búsqueda y ficha con su historial de reparaciones.
- **Artículos.** Catálogo de consulta y edición puntual.
- **Operaciones.** Catálogo de mano de obra.
- **Empresa.** Datos que salen en los documentos y cláusula de protección de datos.
- **Usuarios** (solo admin).
- **Copias de seguridad** (solo admin). Automáticas diarias, manuales, descarga y restauración.
- **Exportar a Excel** los listados de órdenes, clientes y artículos.

## Arquitectura

- `taller-bicicletas/server`: Node 24 + Express 4, Prisma + SQLite (`prisma/dev.db`), JWT de 8 h y bcryptjs. Puerto 3001.
- `taller-bicicletas/src`: React 18 + Vite, Tailwind, react-query v3 y React Router v6. Es una PWA. Las llamadas a la API pasan por un único módulo `src/lib/api.js`.
- PDF con jsPDF + jspdf-autotable, Excel con xlsx.
- Importación: `npm run db:import:clientes`, `db:import:articulos` y `db:import:bicicletas`. Son idempotentes y admiten `--dry-run`.
- Desarrollo: `npm run dev` arranca el backend (con reinicio automático) y el frontend (con recarga en caliente).

## Criterios de aceptación

1. `npm run dev` arranca sin errores y `npm run build` compila.
2. Login con admin/admin123 y mecanico/mecanico123.
3. Se puede crear una orden completa desde cero en menos de un minuto: cliente buscado, bici, problema, líneas autocompletadas y totales correctos.
4. El PDF de una orden no contiene ningún dato interno.
5. Borrar un cliente o una bici con órdenes está impedido y se explica por qué.
6. El historial de un cliente y de una bici muestra todas sus órdenes.

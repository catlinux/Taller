# Taller de bicicletas

Aplicación web para gestionar un taller de bicicletas: órdenes de reparación, clientes, bicicletas, catálogo de artículos y mano de obra. Express + Prisma (SQLite) en el servidor, React + Vite + Tailwind en el cliente.

> Todos los datos de ejemplo (`npm run db:demo`) son **inventados**: empresa, clientes, bicis, artículos y órdenes.

## Desarrollo

```bash
cd taller-bicicletas
cp .env.example .env        # y pon un JWT_SECRET
npm install
npx prisma db push
npm run db:seed             # usuarios y operaciones
npm run db:demo             # (opcional) datos de demostración
npm run dev                 # front http://localhost:5173, API :3001
```

## Usuarios iniciales

`admin / admin123` y `mecanico / mecanico123`. **Cámbialos en el primer acceso** (Configuración › Usuarios), sobre todo en producción.

La demo incluye los mecánicos **Zipi** y **Zape** y la empresa ficticia *Rompecadenas Bike Workshop, S.L.*

## Producción con Apache (subdominio)

Node sirve la API y el front compilado en el puerto 3001 (solo local); Apache hace de proxy inverso con HTTPS.

```bash
git clone https://github.com/catlinux/Taller.git /opt/taller
cd /opt/taller/taller-bicicletas
bash deploy/install.sh --demo      # sin --demo para una base vacía
```

1. `install.sh` crea el `.env` con un `JWT_SECRET` aleatorio, instala dependencias, crea la base SQLite, carga los datos y compila el front.
2. Servicio: `bash taller-bicicletas/deploy/instalar-servicio.sh` genera e instala el servicio systemd con la carpeta, el usuario y el `node` reales de este servidor (`deploy/taller.service` es solo una plantilla con valores de ejemplo: `/opt/taller` y el usuario `taller`; si la copias a mano sin ajustarla, el servicio no arranca). Añade `--dry-run` para ver el resultado sin instalar.
3. Apache: copia `deploy/taller.conf` a `sites-available`, cambia `taller.midominio.com`, `a2enmod proxy proxy_http headers rewrite ssl`, `a2ensite taller`, `certbot --apache -d <subdominio>` y recarga Apache.

Requisitos: Node 20+, Apache 2.4. Actualizar: `bash taller-bicicletas/deploy/update.sh` (ver más abajo).

La base de datos es `taller-bicicletas/prisma/dev.db` y las copias de seguridad se guardan en `data/backups`; ninguna se versiona.

## Instalación en Windows (servidor en la red local)

En el PC que hará de servidor del taller (Windows 10/11), descarga o clona el repositorio y ejecuta el menú de instalación:

```powershell
# desde la carpeta del repositorio
.\instalar.cmd
# o, sin doble clic:
powershell -ExecutionPolicy Bypass -File .\instalar.ps1
```

El menú deja elegir el método:

1. **Windows** — monta el servidor en este PC para la red local (recomendado).
2. **Docker** — para Windows, Linux o Mac con Docker.
3. **Linux (servicio systemd)** — se instala desde la propia máquina destino con `bash taller-bicicletas/deploy/instalar.sh`.

La opción 1 (`taller-bicicletas/deploy/windows/instalar-windows.ps1`) se encarga de todo:

- Se eleva a administrador y comprueba **Node 20+** y **Git** (los instala con `winget` si faltan).
- Clona o actualiza el repositorio (`git fetch` + `git merge --ff-only origin/main`).
- Crea el `.env` con un `JWT_SECRET` aleatorio, instala dependencias, prepara la base de datos, carga usuarios y operaciones y compila el front.
- Deja el servidor arrancando solo con Windows y programa una copia de seguridad diaria (03:00).
- Instala el **actualizador externo**: la tarea programada «Taller vigilante» (`deploy/windows/vigilante.ps1`) atiende las órdenes de la app desde una carpeta de control y actualiza la aplicación sin que node bloquee sus propios ficheros.
- Abre el puerto en el cortafuegos **solo para la red local** y crea un acceso directo en el escritorio.

Opciones útiles (valen igual para `.\instalar.cmd`):

```powershell
.\instalar.ps1 -Simular -SinPreguntas     # ver qué haría, sin cambiar nada
.\instalar.ps1 -Carpeta 'D:\Taller' -Puerto 3055
.\instalar.ps1 -Desinstalar               # quita tareas, arranque automático y cortafuegos
.\instalar.ps1 -Desinstalar -BorrarDatos  # además borra los datos y las copias
```

Al terminar, abre la app en `http://localhost:3001` (o el puerto elegido) desde este PC y en `http://<IP-del-PC>:3001` desde los demás equipos de la red. Requisitos: PowerShell 5.1 (viene con Windows 10/11) y permisos de administrador.

## Actualizaciones desde la aplicación

En **Configuración › Actualizaciones** (solo administradores) se ve la versión instalada (commit y fecha) y si hay una nueva en el repositorio de git:

- **Comprobar:** hace `git fetch` y compara con la rama remota. Si hay novedades, aparece un aviso en la cabecera para los administradores y un botón para actualizar.
- **Actualizar:** según cómo se instaló, la variable `ACTUALIZACIONES` (no la pongas en el `.env`) decide quién aplica la actualización:
  - **`auto`** (Linux con systemd): la propia app, que ya la define `deploy/taller.service`. El proceso es: comprueba que no hay cambios locales ni divergencias, guarda una copia de seguridad, hace un *merge* rápido (`git merge --ff-only`), aplica la base de datos, compila el front y reinicia el servicio (`Restart=always` en `deploy/taller.service`). Si algo falla, revierte al commit anterior.
  - **`docker`** (`vigilante.sh` del anfitrión) y **`externo`** (Windows, tarea programada «Taller vigilante»): la app solo deja la orden en la carpeta de control y el vigilante externo aplica el *merge* y reinicia. Se usa cuando la app no puede reemplazar sus propios ficheros (contenedor sin git o node en Windows).

  Si no hay modo externo ni `auto`, la interfaz solo avisa; la actualización se hace a mano (`bash taller-bicicletas/deploy/update.sh` en Linux o volviendo a lanzar `instalar.ps1` en Windows).

El servidor revisa si hay actualizaciones cada X horas (configurable en Ajustes); 0 desactiva el aviso automático.

## Datos reales y datos de prueba

En **Configuración › Datos** (solo administradores) se elige con qué base trabaja la aplicación:

- **Datos reales:** `taller-bicicletas/prisma/dev.db`.
- **Datos de prueba:** `taller-bicicletas/prisma/demo.db`, con datos inventados. Se crea sola la primera vez que se elige (o con `npm run db:demo`).

Son bases independientes, cada una con sus usuarios y sus copias de seguridad (`data/backups` y `data/backups-demo`). Al cambiar se cierra la sesión. Mientras se usa la de prueba aparece el aviso «MODO PRUEBA». Ninguna base se sube a git.

## Más cosas útiles

- **Modo claro/oscuro:** botón sol/luna en la cabecera (se recuerda en cada navegador).
- **Actualización de la PWA:** el front (PWA) busca una versión nueva cada 5 minutos y se recarga sola; no hace falta vaciar la caché. Para actualizar el servidor, ver «Actualizaciones desde la aplicación».
- **Tests:** `npm test` en `taller-bicicletas` (lector CSV y cálculos de precios).
- Al arrancar, el servidor avisa si `admin` o `mecanico` conservan la contraseña de ejemplo.
- **Sin buscadores:** la aplicación es privada y no debe aparecer en Google. Lo evitan `robots.txt` (`Disallow: /`), la etiqueta `<meta name="robots" content="noindex…">` y la cabecera `X-Robots-Tag` (la envía la app y el VirtualHost de Apache). Para reforzarlo, protege también el subdominio con la contraseña de la propia app o con restricción de IP si lo prefieres.

## Artículos: obsoletos y consumo

En **Artículos** hay tres pestañas:

- **Catálogo:** listado normal. Arriba hay una casilla «Ocultar sin stock de más de N meses» (desmarcada por defecto; N se cambia en Configuración › Taller). Para saber desde cuándo un artículo está sin stock, la app guarda la fecha en que pasó a stock ≤ 0.
- **Obsoletos:** artículos sin stock y/o sin movimientos (no aparecen en ninguna orden) desde hace al menos X días/semanas/meses/años. Se pueden seleccionar y borrar a mano (solo administradores) y exportar a Excel. Las órdenes antiguas conservan sus líneas.
- **Consumo:** materiales consumidos en cualquier periodo (por fecha de entrada de la orden), con atajos (esta semana, mes pasado…), desglose por día/semana/mes/año y filtros por texto, familia, proveedor, mecánico y estado de la orden (los presupuestos no cuentan por defecto). Exporta a Excel y CSV.

La «Forma de pago» de las órdenes es un único campo: Pendiente, Parcial, Efectivo, Tarjeta, Bizum o Transferencia, y se ve en la columna «Pago» del listado.

## Actualizar el servidor a mano

```bash
bash taller-bicicletas/deploy/update.sh           # avanza a la última versión (sin pérdida de datos)
bash taller-bicicletas/deploy/update.sh --force   # solo si el historial de git cambió o hay cambios locales sin valor
```

Hace una copia de la base de datos (`data/backups/backup-pre-update-*.db`, visible en Configuración › Copias de seguridad), `git`, `npm ci`, `prisma db push`, compila y reinicia el servicio `taller`. Es lo que hay que usar la primera vez, hasta que el servidor tenga la versión que incluye el botón de actualizar de la aplicación.

## Instalación con Docker (la del servidor de demo)

`taller-bicicletas/deploy/docker/` tiene todo lo necesario: `Dockerfile`, `docker-compose.yml`, `entrypoint.sh`, `update.sh` y `vigilante.sh`. Estructura en el servidor:

```
~/taller-deploy/
├── Dockerfile, docker-compose.yml, entrypoint.sh, update.sh, vigilante.sh   (copiados de deploy/docker/)
├── .env            JWT_SECRET (y lo que haga falta)
├── control/        carpeta compartida con el contenedor (/control)
└── Taller/         clon de este repositorio
```

- Los datos viven en el volumen `taller-data` (`/data` dentro del contenedor): base de datos y copias de seguridad.
- **Actualizar a mano:** `~/taller-deploy/update.sh` (copia de la base, `git reset` a `origin/main` y `docker compose up -d --build`).
- **Actualizar desde la app:** el contenedor no tiene git ni acceso a Docker. `vigilante.sh`, lanzado por cron cada minuto (`* * * * * $HOME/taller-deploy/vigilante.sh >/dev/null 2>&1` en el crontab del usuario que gestiona Docker), comprueba GitHub cada 30 minutos y atiende en segundos las órdenes de la app («Comprobar ahora» y «Actualizar ahora») a través de `control/`. Requiere `ACTUALIZACIONES=docker` y el volumen `./control:/control`, que ya trae el `docker-compose.yml`.
- Con Docker no se usan `deploy/taller.service` ni `deploy/instalar-servicio.sh` (son para instalar sin Docker, con systemd).

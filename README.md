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
2. Servicio: copia `deploy/taller.service` a `/etc/systemd/system/`, ajusta usuario y ruta, y `systemctl enable --now taller`.
3. Apache: copia `deploy/taller.conf` a `sites-available`, cambia `taller.midominio.com`, `a2enmod proxy proxy_http headers rewrite ssl`, `a2ensite taller`, `certbot --apache -d <subdominio>` y recarga Apache.

Requisitos: Node 20+, Apache 2.4. Actualizar: `git pull && bash deploy/install.sh && systemctl restart taller`.

La base de datos es `taller-bicicletas/prisma/dev.db` y las copias de seguridad se guardan en `data/backups`; ninguna se versiona.

## Datos reales y datos de prueba

En **Configuración › Datos** (solo administradores) se elige con qué base trabaja la aplicación:

- **Datos reales:** `taller-bicicletas/prisma/dev.db`.
- **Datos de prueba:** `taller-bicicletas/prisma/demo.db`, con datos inventados. Se crea sola la primera vez que se elige (o con `npm run db:demo`).

Son bases independientes, cada una con sus usuarios y sus copias de seguridad (`data/backups` y `data/backups-demo`). Al cambiar se cierra la sesión. Mientras se usa la de prueba aparece el aviso «MODO PRUEBA». Ninguna base se sube a git.

## Más cosas útiles

- **Modo claro/oscuro:** botón sol/luna en la cabecera (se recuerda en cada navegador).
- **Actualizaciones:** la aplicación (PWA) busca versiones nuevas cada 5 minutos y se recarga sola; no hace falta vaciar la caché.
- **Tests:** `npm test` en `taller-bicicletas` (lector CSV y cálculos de precios).
- Al arrancar, el servidor avisa si `admin` o `mecanico` conservan la contraseña de ejemplo.
- **Sin buscadores:** la aplicación es privada y no debe aparecer en Google. Lo evitan `robots.txt` (`Disallow: /`), la etiqueta `<meta name="robots" content="noindex…">` y la cabecera `X-Robots-Tag` (la envía la app y el VirtualHost de Apache). Para reforzarlo, protege también el subdominio con la contraseña de la propia app o con restricción de IP si lo prefieres.

## Artículos: obsoletos y consumo

En **Artículos** hay tres pestañas:

- **Catálogo:** listado normal. Arriba hay una casilla «Ocultar sin stock de más de N meses» (desmarcada por defecto; N se cambia en Configuración › Taller). Para saber desde cuándo un artículo está sin stock, la app guarda la fecha en que pasó a stock ≤ 0.
- **Obsoletos:** artículos sin stock y/o sin movimientos (no aparecen en ninguna orden) desde hace al menos X días/semanas/meses/años. Se pueden seleccionar y borrar a mano (solo administradores) y exportar a Excel. Las órdenes antiguas conservan sus líneas.
- **Consumo:** materiales consumidos en cualquier periodo (por fecha de entrada de la orden), con atajos (esta semana, mes pasado…), desglose por día/semana/mes/año y filtros por texto, familia, proveedor, mecánico y estado de la orden (los presupuestos no cuentan por defecto). Exporta a Excel y CSV.

La «Forma de pago» de las órdenes es un único campo: Pendiente, Parcial, Efectivo, Tarjeta, Bizum o Transferencia, y se ve en la columna «Pago» del listado.

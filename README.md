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

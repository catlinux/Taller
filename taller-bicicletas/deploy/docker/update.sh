#!/usr/bin/env bash
# Actualiza desde GitHub y reconstruye el contenedor (los datos se conservan en el volumen).
# Lo usa el vigilante cuando se pulsa «Actualizar ahora» en la aplicación, y se puede lanzar a mano.
set -euo pipefail
cd "$(dirname "$0")"
echo "▶ Copia de seguridad de la base de datos…"
docker exec taller sh -c 'mkdir -p /data/backups && cp /data/dev.db "/data/backups/backup-pre-update-$(date +%Y%m%d-%H%M%S).db"' \
  || echo "⚠ No se pudo hacer la copia (¿el contenedor está parado?); se continúa."
echo "▶ Descargando cambios…"
git -C Taller fetch origin
git -C Taller reset --hard origin/main
echo "▶ Reconstruyendo y reiniciando el contenedor…"
docker compose up -d --build
echo "✔ Actualizado a $(git -C Taller log -1 --pretty='%h %s')"

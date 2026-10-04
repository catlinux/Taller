#!/usr/bin/env bash
# Actualiza la aplicación en el servidor a la última versión de GitHub.
# Uso (desde cualquier carpeta):  bash taller-bicicletas/deploy/update.sh [--force]
#   --force  descarta cambios/historial local y deja el código idéntico a origin/<rama>
#            (necesario una sola vez si el historial del repositorio se reescribió).
# Qué hace: copia de seguridad de la base de datos, git (solo avance, o reset con
# --force), npm ci, prisma db push (sin pérdida de datos), compilar y reiniciar el servicio.
set -euo pipefail
cd "$(dirname "$0")/.."                      # carpeta taller-bicicletas/

[ -f .env ] || { echo "Falta .env: es la primera instalación, usa deploy/install.sh"; exit 1; }
RAIZ=$(git rev-parse --show-toplevel)
RAMA=$(git -C "$RAIZ" rev-parse --abbrev-ref HEAD)
ANTES=$(git -C "$RAIZ" rev-parse HEAD)

echo "▶ Buscando cambios en origin/$RAMA…"
git -C "$RAIZ" fetch --quiet origin "$RAMA"
if [ "${1:-}" = "--force" ]; then
  git -C "$RAIZ" reset --hard "origin/$RAMA"
elif ! git -C "$RAIZ" merge --ff-only "origin/$RAMA"; then
  echo "✖ No se puede avanzar sin conflictos (hay cambios locales o el historial cambió)."
  echo "  Si no tienes nada local que conservar, ejecuta de nuevo con --force."
  exit 1
fi
DESPUES=$(git -C "$RAIZ" rev-parse HEAD)
if [ "$ANTES" = "$DESPUES" ] && [ "${1:-}" != "--force" ]; then
  echo "✔ Ya estás en la última versión ($(git -C "$RAIZ" rev-parse --short HEAD))."
  exit 0
fi

# Copia de seguridad de la base de datos antes de tocar el esquema. El prefijo
# «backup-» hace que la aplicación la muestre en Configuración › Copias de seguridad.
if [ -f prisma/dev.db ]; then
  mkdir -p data/backups
  COPIA="data/backups/backup-pre-update-$(date +%Y%m%d-%H%M%S).db"
  cp prisma/dev.db "$COPIA"
  echo "▶ Copia de seguridad: $COPIA"
fi

echo "▶ Instalando dependencias…"
npm ci --include=dev
echo "▶ Actualizando la base de datos…"
npx prisma db push
echo "▶ Compilando…"
npm run build

if systemctl list-unit-files 2>/dev/null | grep -q '^taller\.service'; then
  echo "▶ Reiniciando el servicio…"
  if [ "$(id -u)" -eq 0 ]; then systemctl restart taller; else sudo systemctl restart taller; fi
else
  echo "⚠ No hay servicio systemd «taller»: reinicia la aplicación a mano (npm start)."
fi
echo "✔ Actualizado a $(git -C "$RAIZ" rev-parse --short HEAD): $(git -C "$RAIZ" log -1 --pretty=%s)"

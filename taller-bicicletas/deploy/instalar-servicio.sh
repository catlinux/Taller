#!/usr/bin/env bash
# Instala el servicio systemd «taller» con la carpeta, el usuario y el node reales de este
# servidor (la plantilla deploy/taller.service trae valores de ejemplo: /opt/taller y «taller»).
# Uso:  bash deploy/instalar-servicio.sh [usuario] [--dry-run]
#   usuario    quien ejecutará el servicio (por defecto, el usuario actual)
#   --dry-run  solo muestra el fichero de servicio, sin instalarlo
set -euo pipefail
cd "$(dirname "$0")/.."                      # carpeta taller-bicicletas/
DIR=$(pwd)
DRY=0; USUARIO=""
for a in "$@"; do if [ "$a" = "--dry-run" ]; then DRY=1; else USUARIO="$a"; fi; done
USUARIO=${USUARIO:-${SUDO_USER:-$(id -un)}}
NODE=$(command -v node) || { echo "✖ No se encuentra node en el PATH"; exit 1; }

UNIDAD=$(sed -e "s#^User=.*#User=$USUARIO#" \
             -e "s#/opt/taller/taller-bicicletas#$DIR#g" \
             -e "s#^ExecStart=.*#ExecStart=$NODE server/index.js#" deploy/taller.service)

if [ "$DRY" -eq 1 ]; then echo "$UNIDAD"; exit 0; fi

[ -f .env ] || { echo "✖ Falta .env: ejecuta antes deploy/install.sh"; exit 1; }
[ -d dist ] || { echo "✖ Falta dist/: ejecuta antes deploy/install.sh (compila la aplicación)"; exit 1; }
SUDO=""; [ "$(id -u)" -eq 0 ] || SUDO="sudo"

echo "$UNIDAD" | $SUDO tee /etc/systemd/system/taller.service >/dev/null
$SUDO systemctl daemon-reload
$SUDO systemctl enable taller >/dev/null 2>&1 || true
$SUDO systemctl restart taller
sleep 2
systemctl --no-pager --lines=8 status taller || true
echo "Si falla, mira: journalctl -u taller -n 50 --no-pager"

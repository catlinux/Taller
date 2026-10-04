#!/usr/bin/env bash
# Instalación / actualización. Ejecutar desde taller-bicicletas/:  bash deploy/install.sh [--demo] [--puerto N]
set -euo pipefail
cd "$(dirname "$0")/.."

# Opciones (todas opcionales; sin ninguna, el comportamiento es el de siempre):
#   --demo     carga además los datos de demostración
#   --puerto N escribe PORT=N en el .env (lo usa el instalador de Linux con systemd)
DEMO=0; PUERTO=""
while [ $# -gt 0 ]; do
  case "$1" in
    --demo) DEMO=1 ;;
    --puerto) PUERTO="${2:-}"; shift ;;
    --puerto=*) PUERTO="${1#*=}" ;;
  esac
  shift
done

if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")/" .env
  echo "Creado .env con un JWT_SECRET nuevo."
fi

# El puerto (si se indicó) va al .env como PORT; se respeta el resto del fichero.
if [ -n "$PUERTO" ]; then
  if grep -q '^PORT=' .env; then
    sed -i "s/^PORT=.*/PORT=$PUERTO/" .env
  else
    printf 'PORT=%s\n' "$PUERTO" >> .env
  fi
fi

npm ci
npx prisma db push
npm run db:seed          # usuarios por defecto y catálogo de operaciones (idempotente)
if [ "$DEMO" -eq 1 ]; then npm run db:demo; fi
npm run build
echo "Listo. Arranca con: npm start   (o systemctl restart taller)"

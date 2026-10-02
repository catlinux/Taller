#!/usr/bin/env bash
# Instalación / actualización. Ejecutar desde taller-bicicletas/:  bash deploy/install.sh [--demo]
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")/" .env
  echo "Creado .env con un JWT_SECRET nuevo."
fi

npm ci
npx prisma db push
npm run db:seed          # usuarios por defecto y catálogo de operaciones (idempotente)
if [ "${1:-}" = "--demo" ]; then npm run db:demo; fi
npm run build
echo "Listo. Arranca con: npm start   (o systemctl restart taller)"

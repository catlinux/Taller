#!/usr/bin/env bash
set -e
cd /app
ln -sf /data/dev.db /app/prisma/dev.db
npx prisma db push --skip-generate
if [ ! -f /data/.seeded ]; then
  npm run db:seed
  # Datos de demostración (clientes y artículos inventados) solo si se piden con CARGAR_DEMO=1.
  if [ "${CARGAR_DEMO:-0}" = "1" ]; then npm run db:demo; fi
  touch /data/.seeded
fi
exec node server/index.js

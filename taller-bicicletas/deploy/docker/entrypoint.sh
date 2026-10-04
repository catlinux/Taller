#!/usr/bin/env bash
set -e
cd /app
ln -sf /data/dev.db /app/prisma/dev.db
npx prisma db push --skip-generate
if [ ! -f /data/.seeded ]; then
  npm run db:seed && npm run db:demo && touch /data/.seeded
fi
exec node server/index.js

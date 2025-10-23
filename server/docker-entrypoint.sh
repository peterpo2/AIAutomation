#!/bin/sh
set -e

if [ -f /app/prisma/schema.prisma ]; then
  echo "Running database migrations..."
  npx prisma migrate deploy --schema /app/prisma/schema.prisma
else
  echo "Prisma schema not found at /app/prisma/schema.prisma. Skipping migrations."
fi

exec "$@"

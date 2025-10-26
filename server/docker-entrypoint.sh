#!/bin/sh
set -e

if [ -f /app/prisma/schema.prisma ]; then
  echo "Synchronizing Prisma schema with database..."
  npx prisma db push --schema /app/prisma/schema.prisma --skip-generate
else
  echo "Prisma schema not found at /app/prisma/schema.prisma. Skipping schema synchronization."
fi

exec "$@"

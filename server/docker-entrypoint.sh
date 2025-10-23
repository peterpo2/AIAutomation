#!/bin/sh
set -e

if [ -f /app/prisma/schema.prisma ]; then
  echo "Preparing database migrations..."
  # Clean up the legacy migration entry that failed before we regenerated the init migration.
  npx prisma migrate resolve \
    --schema /app/prisma/schema.prisma \
    --rolled-back 20250228000000_add_video_category_column >/dev/null 2>&1 || true

  echo "Running database migrations..."
  npx prisma migrate deploy --schema /app/prisma/schema.prisma
else
  echo "Prisma schema not found at /app/prisma/schema.prisma. Skipping migrations."
fi

exec "$@"

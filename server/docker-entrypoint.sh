#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  for candidate in "$SUPABASE_DATABASE_URL" "$SUPABASE_DB_URL" "$SUPABASE_CONNECTION_STRING" "$SUPABASE_POSTGRES_URL"; do
    if [ -n "$candidate" ]; then
      export DATABASE_URL="$candidate"
      echo "DATABASE_URL not provided. Using Supabase connection string for Prisma synchronization."
      break
    fi
  done
fi

if [ -f /app/prisma/schema.prisma ]; then
  echo "Synchronizing Prisma schema with database..."
  npx prisma db push --schema /app/prisma/schema.prisma --skip-generate
else
  echo "Prisma schema not found at /app/prisma/schema.prisma. Skipping schema synchronization."
fi

exec "$@"

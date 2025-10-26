import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const resolveDatabaseUrl = () => {
  const candidates = [
    process.env.DATABASE_URL,
    process.env.SUPABASE_DATABASE_URL,
    process.env.SUPABASE_DB_URL,
    process.env.SUPABASE_CONNECTION_STRING,
    process.env.SUPABASE_POSTGRES_URL,
  ];

  for (const candidate of candidates) {
    if (candidate && candidate.trim().length > 0) {
      return candidate;
    }
  }

  throw new Error(
    'A PostgreSQL connection string is required. Please set DATABASE_URL or one of the Supabase connection variables.',
  );
};

const databaseUrl = resolveDatabaseUrl();

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = databaseUrl;
}

export const prisma = new PrismaClient({
  datasources: {
    db: { url: databaseUrl },
  },
});

if (process.env.NODE_ENV !== 'test') {
  prisma.$connect().catch((error: unknown) => {
    console.error('Failed to connect to the database', error);
    process.exit(1);
  });

  process.on('beforeExit', async () => {
    await prisma.$disconnect();
  });
}

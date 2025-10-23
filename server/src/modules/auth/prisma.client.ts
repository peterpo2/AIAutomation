import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is not set.');
}

export const prisma = new PrismaClient();

if (process.env.NODE_ENV !== 'test') {
  prisma.$connect().catch((error: unknown) => {
    console.error('Failed to connect to the database', error);
    process.exit(1);
  });

  process.on('beforeExit', async () => {
    await prisma.$disconnect();
  });
}

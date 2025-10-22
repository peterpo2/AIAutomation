import { URL } from 'url';

import { prisma } from '../auth/prisma.client.js';

const describeValue = (value: string | undefined | null) => {
  if (!value) {
    return 'missing';
  }
  return `present (${value.length} characters)`;
};

export const logDatabaseEnvDiagnostics = () => {
  console.info('[env] Checking database environment configuration...');

  const databaseUrl = process.env.DATABASE_URL;
  const postgresPassword = process.env.POSTGRES_PASSWORD;
  const postgresUser = process.env.POSTGRES_USER;
  const postgresDb = process.env.POSTGRES_DB;

  if (!databaseUrl) {
    console.error('[env] DATABASE_URL is not set. The backend cannot connect without it.');
    return;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[env] DATABASE_URL is not a valid URL: ${message}`);
    return;
  }

  console.info(`  • Host: ${parsedUrl.hostname || 'missing'}`);
  console.info(`  • Port: ${parsedUrl.port || '(default)'}`);
  console.info(`  • Database: ${parsedUrl.pathname?.replace(/^\//, '') || 'missing'}`);
  console.info(`  • User: ${parsedUrl.username || 'missing'}`);
  console.info(`  • Password: ${describeValue(parsedUrl.password)}`);
  console.info(`  • POSTGRES_PASSWORD: ${describeValue(postgresPassword)}`);

  if (!parsedUrl.username) {
    console.warn('[env] DATABASE_URL does not specify a username.');
  } else if (postgresUser && postgresUser !== parsedUrl.username) {
    console.warn('[env] POSTGRES_USER does not match the username embedded in DATABASE_URL.');
  }

  if (!parsedUrl.password) {
    console.warn('[env] DATABASE_URL does not include a password.');
  }

  if (!postgresPassword) {
    console.warn('[env] POSTGRES_PASSWORD is empty. Docker Compose will start Postgres with a blank password.');
  }

  if (parsedUrl.password && postgresPassword && parsedUrl.password !== postgresPassword) {
    console.error('[env] POSTGRES_PASSWORD and the password embedded in DATABASE_URL do not match.');
  }

  if (postgresDb) {
    const dbFromUrl = parsedUrl.pathname?.replace(/^\//, '') || '';
    if (dbFromUrl && dbFromUrl !== postgresDb) {
      console.warn('[env] POSTGRES_DB does not match the database specified in DATABASE_URL.');
    }
  }
};

export const verifyDatabaseConnectivity = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.info('[env] Successfully connected to Postgres using the current DATABASE_URL.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[env] Failed to connect to Postgres. Verify that the credentials above are correct.');
    console.error(`[env] Prisma error: ${message}`);
  }
};

import { createClient } from '@supabase/supabase-js';
import { prisma } from '../modules/auth/prisma.client.js';
import { getFirebaseAdmin, initFirebase } from '../modules/auth/firebase.service.js';
import { dropboxService } from '../modules/dropbox/dropbox.service.js';

export interface StartupStatus {
  supabase: boolean;
  firebase: boolean;
  postgres: boolean;
  dropbox: boolean;
}

function resolveSupabaseCredentials() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_API_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  return { url, key };
}

export async function runStartupChecks(): Promise<StartupStatus> {
  const status: StartupStatus = {
    supabase: false,
    firebase: false,
    postgres: false,
    dropbox: false,
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    status.postgres = true;
    console.log('PostgreSQL connection verified.');
  } catch (error) {
    console.error('PostgreSQL connection failed.', error);
  }

  try {
    initFirebase();
    const admin = getFirebaseAdmin();
    await admin.auth().listUsers(1);
    status.firebase = true;
    console.log('Firebase connection verified.');
  } catch (error) {
    console.error('Firebase connection failed.', error);
  }

  try {
    await dropboxService.verifyConnection();
    status.dropbox = true;
    console.log('Dropbox connection verified.');
  } catch (error) {
    console.error('Dropbox connection failed.', error);
  }

  const supabaseCredentials = resolveSupabaseCredentials();
  if (supabaseCredentials) {
    try {
      const client = createClient(supabaseCredentials.url, supabaseCredentials.key);
      const { error } = await client.auth.getSession();
      if (error) {
        throw error;
      }
      status.supabase = true;
      console.log('Supabase connection verified.');
    } catch (error) {
      console.error('Supabase connection failed.', error);
    }
  } else {
    console.error('Supabase credentials are not configured.');
  }

  return status;
}

export function assertStartupStatus(status: StartupStatus) {
  const failed = Object.entries(status)
    .filter(([, ok]) => !ok)
    .map(([key]) => key);

  if (failed.length > 0) {
    throw new Error(`Startup checks failed for: ${failed.join(', ')}`);
  }
}

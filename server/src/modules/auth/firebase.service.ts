import admin from 'firebase-admin';

export type FirebaseAdminClient = typeof admin;

let initialized = false;

export const initFirebase = () => {
  if (initialized) return admin;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase Admin credentials are not configured');
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });

  initialized = true;
  return admin;
};

interface GetFirebaseAdminOptions {
  allowUninitialized?: boolean;
}

export function getFirebaseAdmin(): FirebaseAdminClient;
export function getFirebaseAdmin(options: { allowUninitialized: true }): FirebaseAdminClient | null;
export function getFirebaseAdmin(options?: GetFirebaseAdminOptions): FirebaseAdminClient | null {
  if (!initialized) {
    try {
      initFirebase();
    } catch (error) {
      if (options?.allowUninitialized) {
        return null;
      }
      throw error;
    }
  }

  return admin;
}

export const isFirebaseInitialized = () => initialized;

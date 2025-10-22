import type { FirebaseApp } from 'firebase/app';
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';

const rawDemoFlag = import.meta.env.VITE_ENABLE_DEMO_AUTH;
export const isDemoAuthEnabled =
  rawDemoFlag === undefined ? true : rawDemoFlag === 'true' || rawDemoFlag === '1';

const requiredFirebaseEnv = {
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
};

const missingFirebaseEnv = Object.entries(requiredFirebaseEnv)
  .filter(([, value]) => !value)
  .map(([key]) => key);

export const firebaseConfigError =
  !isDemoAuthEnabled && missingFirebaseEnv.length > 0
    ? `Missing Firebase environment variables: ${missingFirebaseEnv.join(', ')}`
    : null;

const firebaseConfig =
  firebaseConfigError || isDemoAuthEnabled
    ? null
    : {
        apiKey: requiredFirebaseEnv.VITE_FIREBASE_API_KEY,
        authDomain: requiredFirebaseEnv.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: requiredFirebaseEnv.VITE_FIREBASE_PROJECT_ID,
        storageBucket: requiredFirebaseEnv.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: requiredFirebaseEnv.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: requiredFirebaseEnv.VITE_FIREBASE_APP_ID,
      };

let app: FirebaseApp | null = null;

if (firebaseConfig) {
  app = initializeApp(firebaseConfig);
} else if (firebaseConfigError) {
  console.warn(firebaseConfigError);
} else if (isDemoAuthEnabled) {
  console.info('Firebase demo authentication mode enabled.');
}

export const firebaseApp = app;
export const auth = app ? getAuth(app) : null;

let messaging: ReturnType<typeof getMessaging> | null = null;

export const initializeMessaging = async () => {
  if (!firebaseApp || isDemoAuthEnabled) {
    return null;
  }
  const supported = await isSupported();
  if (supported) {
    messaging = getMessaging(firebaseApp);
    return messaging;
  }
  return null;
};

export const requestNotificationPermission = async () => {
  if (!firebaseApp || isDemoAuthEnabled) {
    return null;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const msg = await initializeMessaging();
      if (msg) {
        const token = await getToken(msg, {
          vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
        });
        return token;
      }
    }
  } catch (error) {
    console.error('Error getting notification permission:', error);
  }
  return null;
};

export const onMessageListener = async () => {
  if (!firebaseApp || isDemoAuthEnabled) {
    return null;
  }
  const msg = await initializeMessaging();
  if (msg) {
    return new Promise((resolve) => {
      onMessage(msg, (payload) => {
        resolve(payload);
      });
    });
  }
  return null;
};

/**
 * Firebase web app + Auth, client-only. The web config (apiKey, authDomain, ...) is a PUBLIC identifier,
 * not a secret: it ships in the client bundle by design, so it lives in NEXT_PUBLIC_FIREBASE_* vars (the one
 * documented exception to .env.example's "no NEXT_PUBLIC_ prefix" rule). Security is enforced by the Firebase
 * Auth provider settings + Security Rules, never by hiding the apiKey. This app uses NO Firestore/RTDB, so only
 * firebase/app and firebase/auth are imported (keeps Firestore out of the bundle).
 *
 * readFirebaseConfig is a pure helper (unit-tested in firebase.test.ts) so the config contract can be checked
 * without initializing the SDK. The app is initialized lazily and only in the browser; nothing here throws at
 * import time, so a deploy with no config renders fine (firebaseEnabled is false and the demo bypass still works).
 */
import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import { type Auth, getAuth } from "firebase/auth";

export type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  messagingSenderId?: string;
  storageBucket?: string;
};

/**
 * Build a FirebaseConfig from env, or null if any required key is missing. `env` is passed in (not read from
 * process.env here) so it's pure and testable; the browser caller below passes the inlined NEXT_PUBLIC_ values.
 */
export function readFirebaseConfig(env: Record<string, string | undefined>): FirebaseConfig | null {
  const apiKey = env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = env.NEXT_PUBLIC_FIREBASE_APP_ID;
  if (!apiKey || !authDomain || !projectId || !appId) return null;

  const config: FirebaseConfig = { apiKey, authDomain, projectId, appId };
  const messagingSenderId = env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const storageBucket = env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (messagingSenderId) config.messagingSenderId = messagingSenderId;
  if (storageBucket) config.storageBucket = storageBucket;
  return config;
}

// Next.js inlines each process.env.NEXT_PUBLIC_* reference at build time, so they must be named individually
// (passing `process.env` wholesale would not be replaced). Evaluated once at module load.
const config = readFirebaseConfig({
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
});

/** True when valid web config is present. The UI offers real sign-in only when this is true. */
export const firebaseEnabled = config !== null;

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;

/**
 * The Auth instance, or null when config is absent or we're not in the browser. Initializes lazily on first
 * call in the browser; never throws. Callers must handle null (the demo bypass path).
 */
export function getFirebaseAuth(): Auth | null {
  if (config === null || typeof window === "undefined") return null;
  if (!authInstance) {
    app = getApps().length > 0 ? getApps()[0] : initializeApp(config);
    authInstance = getAuth(app);
  }
  return authInstance;
}

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  clearIndexedDbPersistence,
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  terminate,
  type Firestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
};

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId,
);

/** Solo para desarrollo: NEXT_PUBLIC_USE_EMULATORS=1 conecta a los emuladores locales. */
const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === "1";
let emulatorsConnected = false;

let app: FirebaseApp | undefined;
let firestore: Firestore | undefined;

export function firebaseApp(): FirebaseApp {
  if (!firebaseConfigured) {
    throw new Error("Falta la configuración de Firebase en .env.local");
  }
  app ??= getApps().find((a) => a.name === "[DEFAULT]") ?? initializeApp(firebaseConfig);
  if (useEmulators && !emulatorsConnected) {
    emulatorsConnected = true;
    connectAuthEmulator(getAuth(app), "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db(), "127.0.0.1", 8080);
  }
  return app;
}

/** Auth de Firebase (solo en el navegador). */
export function auth(): Auth {
  return getAuth(firebaseApp());
}

/**
 * Firestore (solo en el navegador). No se usa Firebase Storage.
 * Con almacenamiento local: lo guardado aparece al instante y se sube en segundo
 * plano; también funciona sin señal y sincroniza al volver.
 */
export function db(): Firestore {
  if (firestore) return firestore;
  const a = app ?? firebaseApp();
  if (firestore) return firestore;
  try {
    firestore = initializeFirestore(a, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    firestore = getFirestore(a); // ya inicializado, o el navegador no permite almacenamiento local
  }
  return firestore;
}

/** Borra los datos guardados en este dispositivo (al cerrar sesión). */
export async function clearLocalData(): Promise<void> {
  if (!firestore) return;
  const f = firestore;
  firestore = undefined;
  await terminate(f).catch(() => undefined);
  await clearIndexedDbPersistence(f).catch(() => undefined);
}

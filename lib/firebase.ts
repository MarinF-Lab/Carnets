import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";

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

export function firebaseApp(): FirebaseApp {
  if (!firebaseConfigured) {
    throw new Error("Falta la configuración de Firebase en .env.local");
  }
  app ??= getApps().find((a) => a.name === "[DEFAULT]") ?? initializeApp(firebaseConfig);
  if (useEmulators && !emulatorsConnected) {
    emulatorsConnected = true;
    connectAuthEmulator(getAuth(app), "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(getFirestore(app), "127.0.0.1", 8080);
  }
  return app;
}

/** Auth de Firebase (solo en el navegador). */
export function auth(): Auth {
  return getAuth(firebaseApp());
}

/** Firestore (solo en el navegador). No se usa Firebase Storage. */
export function db(): Firestore {
  return getFirestore(firebaseApp());
}

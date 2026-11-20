import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

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

let app: FirebaseApp | undefined;

function firebaseApp(): FirebaseApp {
  if (!firebaseConfigured) {
    throw new Error("Falta la configuración de Firebase en .env.local");
  }
  app ??= getApps().length ? getApp() : initializeApp(firebaseConfig);
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

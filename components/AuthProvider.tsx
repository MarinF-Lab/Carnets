"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { auth, db, firebaseConfigured } from "@/lib/firebase";
import { MIN_PASSWORD, isValidUsername, normalizeUsername, usernameToEmail, UserError, type Role } from "@/lib/users";

export type { Role };

export type AuthState =
  | { status: "loading" }
  | { status: "unconfigured" }
  | { status: "setup" }
  | { status: "signedOut" }
  | { status: "denied"; user: User }
  | { status: "error"; message: string }
  | { status: "allowed"; user: User; username: string; role: Role };

type AuthContextValue = {
  state: AuthState;
  signIn: (username: string, password: string) => Promise<void>;
  setup: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Revisa que el usuario exista en users/{uid} y esté activo. */
async function checkAccess(user: User): Promise<AuthState> {
  try {
    const snap = await getDoc(doc(db(), "users", user.uid));
    if (!snap.exists() || snap.data().active === false) return { status: "denied", user };
    const d = snap.data();
    return { status: "allowed", user, username: String(d.username ?? ""), role: d.role === "admin" ? "admin" : "user" };
  } catch (err) {
    if ((err as { code?: string }).code === "permission-denied") return { status: "denied", user };
    return { status: "error", message: "No se pudo verificar el acceso. Revisa tu conexión." };
  }
}

/** ¿Ya se hizo la configuración inicial (existe el primer admin)? */
async function setupDone(): Promise<boolean> {
  const snap = await getDoc(doc(db(), "config", "setup"));
  return snap.exists();
}

export function authErrorMessage(err: unknown): string {
  if (err instanceof UserError) return err.message;
  const code = (err as { code?: string }).code ?? "";
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email"].includes(code))
    return "Usuario o contraseña incorrectos.";
  if (code === "auth/too-many-requests") return "Demasiados intentos. Espera unos minutos.";
  if (code === "auth/network-request-failed") return "Sin conexión. Revisa tu internet.";
  if (code === "auth/weak-password") return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`;
  if (code === "auth/operation-not-allowed") return "El acceso con usuario y contraseña no está activado en Firebase.";
  return "No se pudo completar. Inténtalo de nuevo.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(
    firebaseConfigured ? { status: "loading" } : { status: "unconfigured" },
  );
  // Durante la configuración inicial se ignoran los cambios de sesión intermedios.
  const busySetup = useRef(false);

  useEffect(() => {
    if (!firebaseConfigured) return;
    let active = true;
    const unsubscribe = onAuthStateChanged(auth(), async (user) => {
      if (busySetup.current) return;
      if (!user) {
        try {
          const done = await setupDone();
          if (active) setState({ status: done ? "signedOut" : "setup" });
        } catch {
          if (active) setState({ status: "signedOut" });
        }
        return;
      }
      if (active) setState({ status: "loading" });
      const next = await checkAccess(user);
      if (active) setState(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    await signInWithEmailAndPassword(auth(), usernameToEmail(username), password);
  }, []);

  const setup = useCallback(async (rawUsername: string, password: string) => {
    const username = normalizeUsername(rawUsername);
    if (!isValidUsername(username)) throw new UserError("Usuario no válido: usa de 2 a 30 letras o números, sin espacios.");
    if (password.length < MIN_PASSWORD) throw new UserError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
    busySetup.current = true;
    try {
      const cred = await createUserWithEmailAndPassword(auth(), usernameToEmail(username), password);
      const batch = writeBatch(db());
      batch.set(doc(db(), "users", cred.user.uid), { username, role: "admin", active: true, createdAt: serverTimestamp() });
      batch.set(doc(db(), "config", "setup"), { adminUid: cred.user.uid, createdAt: serverTimestamp() });
      try {
        await batch.commit();
      } catch (err) {
        // Otro dispositivo ya hizo la configuración: deshacer la cuenta recién creada.
        await cred.user.delete().catch(() => undefined);
        throw err;
      }
      setState(await checkAccess(cred.user));
    } finally {
      busySetup.current = false;
    }
  }, []);

  const signOut = useCallback(async () => {
    await fbSignOut(auth());
  }, []);

  return <AuthContext.Provider value={{ state, signIn, setup, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}

/** Atajo para pantallas protegidas: devuelve el usuario autorizado y su rol. */
export function useAllowedUser() {
  const { state } = useAuth();
  if (state.status !== "allowed") throw new Error("useAllowedUser requiere un usuario autorizado");
  return { user: state.user, username: state.username, role: state.role, isAdmin: state.role === "admin" };
}

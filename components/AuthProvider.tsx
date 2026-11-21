"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, clearLocalData, db, firebaseConfigured } from "@/lib/firebase";
import { pendingWrites } from "@/lib/sync";
import { findGroupByPassword, isValidUsername, MIN_PASSWORD, normalizeUsername, usernameToEmail, UserError } from "@/lib/users";

export type AuthState =
  | { status: "loading" }
  | { status: "unconfigured" }
  | { status: "signedOut" }
  | { status: "denied"; user: User; reason: "admin" | "user" | "noGroup" }
  | { status: "error"; message: string }
  | { status: "allowed"; user: User; kind: "admin"; username: string; groupId: null }
  | { status: "allowed"; user: User; kind: "user"; username: string; groupId: string };

/** Resultado de entrar como usuario: listo, o pedir confirmación para crear el usuario nuevo. */
export type SignInResult = { status: "ok" } | { status: "new"; username: string; groupName: string };

type AuthContextValue = {
  state: AuthState;
  signInUser: (username: string, password: string) => Promise<SignInResult>;
  /** Crea el usuario en el grupo de esa contraseña (tras confirmar). */
  registerUser: (username: string, password: string) => Promise<void>;
  signInAdmin: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function isGoogle(user: User) {
  return user.providerData.some((p) => p.providerId === "google.com");
}

/** Admin: correo autorizado en admins/{email}. Usuario: users/{uid} activo y con grupo. */
async function checkAccess(user: User): Promise<AuthState> {
  try {
    if (isGoogle(user)) {
      const email = user.email?.toLowerCase() ?? "";
      const snap = email ? await getDoc(doc(db(), "admins", email)) : null;
      if (!snap?.exists()) return { status: "denied", user, reason: "admin" };
      return { status: "allowed", user, kind: "admin", username: email, groupId: null };
    }
    const snap = await getDoc(doc(db(), "users", user.uid));
    if (!snap.exists() || snap.data().active === false) return { status: "denied", user, reason: "user" };
    const d = snap.data();
    if (!d.groupId) return { status: "denied", user, reason: "noGroup" };
    return { status: "allowed", user, kind: "user", username: String(d.username ?? ""), groupId: String(d.groupId) };
  } catch (err) {
    if ((err as { code?: string }).code === "permission-denied") {
      return { status: "denied", user, reason: isGoogle(user) ? "admin" : "user" };
    }
    return { status: "error", message: "No se pudo verificar el acceso. Revisa tu conexión." };
  }
}

export function authErrorMessage(err: unknown): string {
  if (err instanceof UserError) return err.message;
  const code = (err as { code?: string }).code ?? "";
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email"].includes(code))
    return "Usuario o contraseña incorrectos.";
  if (code === "auth/too-many-requests") return "Demasiados intentos. Espera unos minutos.";
  if (code === "auth/network-request-failed") return "Sin conexión. Revisa tu internet.";
  if (code === "auth/weak-password") return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`;
  if (code === "auth/operation-not-allowed") return "Este método de acceso no está activado en Firebase.";
  if (code === "permission-denied") return "No tienes permiso para hacer esto.";
  return "No se pudo completar. Inténtalo de nuevo.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(
    firebaseConfigured ? { status: "loading" } : { status: "unconfigured" },
  );
  // Durante el registro se ignoran los cambios de sesión intermedios.
  const registering = useRef(false);

  useEffect(() => {
    if (!firebaseConfigured) return;
    let active = true;
    const unsubscribe = onAuthStateChanged(auth(), async (user) => {
      if (registering.current) return;
      if (!user) {
        if (active) setState({ status: "signedOut" });
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

  const signInUser = useCallback(async (rawUsername: string, password: string): Promise<SignInResult> => {
    const username = normalizeUsername(rawUsername);
    if (!isValidUsername(username)) throw new UserError("Usuario no válido: usa de 2 a 30 letras o números, sin espacios.");
    try {
      await signInWithEmailAndPassword(auth(), usernameToEmail(username), password);
      return { status: "ok" };
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      if (!["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password"].includes(code)) throw err;
      // ¿Usuario nuevo? La contraseña indica el grupo.
      const group = await findGroupByPassword(password);
      if (!group) throw new UserError("Contraseña incorrecta: no corresponde a ningún grupo.");
      return { status: "new", username, groupName: group.name };
    }
  }, []);

  const registerUser = useCallback(async (rawUsername: string, password: string) => {
    const username = normalizeUsername(rawUsername);
    const group = await findGroupByPassword(password);
    if (!group) throw new UserError("Contraseña incorrecta: no corresponde a ningún grupo.");
    registering.current = true;
    try {
      let cred;
      try {
        cred = await createUserWithEmailAndPassword(auth(), usernameToEmail(username), password);
      } catch (err) {
        if ((err as { code?: string }).code === "auth/email-already-in-use") {
          throw new UserError("Ese usuario ya existe con otra contraseña. Elige otro nombre.");
        }
        throw err;
      }
      try {
        await setDoc(doc(db(), "users", cred.user.uid), {
          username,
          groupId: group.groupId,
          joinKey: group.key,
          active: true,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        await cred.user.delete().catch(() => undefined);
        throw err;
      }
      setState(await checkAccess(cred.user));
    } finally {
      registering.current = false;
    }
  }, []);

  const signInAdmin = useCallback(async () => {
    // Solo con emuladores locales: cuenta de Google simulada (no existe en producción).
    if (process.env.NEXT_PUBLIC_USE_EMULATORS === "1") {
      const email = window.prompt("Correo de Google (emulador)");
      if (!email) return;
      const token = JSON.stringify({ sub: email, email, email_verified: true });
      await signInWithCredential(auth(), GoogleAuthProvider.credential(token));
      return;
    }
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await signInWithPopup(auth(), provider);
    } catch (err) {
      const code = (err as { code?: string }).code;
      // Si el navegador bloquea la ventana emergente, usar redirección.
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
        await signInWithRedirect(auth(), provider);
        return;
      }
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
    const pending = pendingWrites();
    if (
      pending > 0 &&
      !window.confirm(`Hay ${pending} ${pending === 1 ? "cambio" : "cambios"} sin subir. Si sales ahora se perderán. ¿Salir igual?`)
    ) {
      return;
    }
    await fbSignOut(auth());
    // Los carnets son datos sensibles: no dejarlos guardados en el celular.
    await clearLocalData();
    window.location.reload();
  }, []);

  return <AuthContext.Provider value={{ state, signInUser, registerUser, signInAdmin, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}

/** Atajo para pantallas protegidas: usuario autorizado y si es administrador. */
export function useAllowedUser() {
  const { state } = useAuth();
  if (state.status !== "allowed") throw new Error("useAllowedUser requiere un usuario autorizado");
  return { user: state.user, username: state.username, isAdmin: state.kind === "admin", ownGroupId: state.groupId };
}

"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db, firebaseConfigured } from "@/lib/firebase";

export type Role = "admin" | "user";

export type AuthState =
  | { status: "loading" }
  | { status: "unconfigured" }
  | { status: "signedOut" }
  | { status: "denied"; user: User }
  | { status: "error"; user: User; message: string }
  | { status: "allowed"; user: User; role: Role };

type AuthContextValue = {
  state: AuthState;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Revisa si el correo está en la lista blanca allowedUsers/{email}. */
async function checkAccess(user: User): Promise<AuthState> {
  const email = user.email?.toLowerCase();
  if (!email) return { status: "denied", user };
  try {
    const snap = await getDoc(doc(db(), "allowedUsers", email));
    if (!snap.exists()) return { status: "denied", user };
    const role: Role = snap.data().role === "admin" ? "admin" : "user";
    return { status: "allowed", user, role };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "permission-denied") return { status: "denied", user };
    return { status: "error", user, message: "No se pudo verificar el acceso. Revisa tu conexión." };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(
    firebaseConfigured ? { status: "loading" } : { status: "unconfigured" },
  );

  useEffect(() => {
    if (!firebaseConfigured) return;
    let active = true;
    const unsubscribe = onAuthStateChanged(auth(), async (user) => {
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

  const signIn = useCallback(async () => {
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
    await fbSignOut(auth());
  }, []);

  return <AuthContext.Provider value={{ state, signIn, signOut }}>{children}</AuthContext.Provider>;
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
  return { user: state.user, role: state.role, isAdmin: state.role === "admin" };
}

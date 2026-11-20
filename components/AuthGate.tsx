"use client";

import { useState, type ReactNode } from "react";
import { useAuth } from "./AuthProvider";

function Screen({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm rounded-2xl bg-card p-8 text-center shadow-sm">{children}</div>
    </main>
  );
}

function Logo() {
  return (
    <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-accent text-2xl font-bold text-white">
      C
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="h-5 w-5">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

const buttonPrimary =
  "inline-flex min-h-11 w-full items-center justify-center gap-3 rounded-xl bg-ink px-5 text-base font-semibold text-paper transition-opacity active:opacity-80 disabled:opacity-50";
const buttonSecondary =
  "inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-line px-5 text-base font-medium";

/** Muestra login, "Sin acceso" o el contenido según el estado de la sesión. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { state, signIn, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setBusy(true);
    setError(null);
    try {
      await signIn();
    } catch {
      setError("No se pudo iniciar sesión. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  switch (state.status) {
    case "loading":
      return (
        <Screen>
          <Logo />
          <p className="text-muted">Cargando…</p>
        </Screen>
      );

    case "unconfigured":
      return (
        <Screen>
          <Logo />
          <h1 className="mb-2 text-xl font-bold">Falta configurar Firebase</h1>
          <p className="text-muted">
            Crea el archivo <code>.env.local</code> a partir de <code>.env.local.example</code> y reinicia la app.
          </p>
        </Screen>
      );

    case "signedOut":
      return (
        <Screen>
          <Logo />
          <h1 className="mb-1 text-2xl font-bold">Carnets</h1>
          <p className="mb-8 text-muted">Escáner de carnets por contratista</p>
          <button type="button" className={buttonPrimary} onClick={handleSignIn} disabled={busy}>
            <GoogleIcon />
            {busy ? "Abriendo Google…" : "Iniciar sesión con Google"}
          </button>
          {error && <p className="mt-4 text-sm text-accent">{error}</p>}
          <p className="mt-6 text-sm text-muted">Solo pueden entrar usuarios autorizados.</p>
        </Screen>
      );

    case "denied":
      return (
        <Screen>
          <Logo />
          <h1 className="mb-2 text-2xl font-bold">Sin acceso</h1>
          <p className="mb-1 text-muted">Tu cuenta no está autorizada para usar esta app:</p>
          <p className="mb-6 font-medium break-all">{state.user.email}</p>
          <p className="mb-6 text-sm text-muted">Pide a un administrador que agregue tu correo.</p>
          <button type="button" className={buttonSecondary} onClick={() => signOut()}>
            Usar otra cuenta
          </button>
        </Screen>
      );

    case "error":
      return (
        <Screen>
          <Logo />
          <h1 className="mb-2 text-xl font-bold">Algo salió mal</h1>
          <p className="mb-6 text-muted">{state.message}</p>
          <button type="button" className={buttonPrimary} onClick={() => window.location.reload()}>
            Reintentar
          </button>
          <button type="button" className={`${buttonSecondary} mt-3`} onClick={() => signOut()}>
            Cerrar sesión
          </button>
        </Screen>
      );

    case "allowed":
      return <>{children}</>;
  }
}

"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { authErrorMessage, useAuth } from "./AuthProvider";
import { GroupProvider } from "./GroupProvider";
import { btn, input, Spinner } from "./ui";

const LAST_USER = "carnets.lastUser";

function Screen({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm rounded-3xl bg-card p-7 shadow-sm">{children}</div>
    </main>
  );
}

function Logo() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/icons/icon.svg" alt="" className="mx-auto mb-5 h-14 w-14 rounded-2xl" />
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-left">
      <span className="mb-1.5 block text-sm font-medium text-muted">{label}</span>
      <input className={input} {...props} />
    </label>
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

function LoginForm() {
  const { signInUser, signInAdmin } = useAuth();
  const [mode, setMode] = useState<"user" | "admin">("user");
  const [username, setUsername] = useState(() => {
    try {
      return localStorage.getItem(LAST_USER) ?? "";
    } catch {
      return "";
    }
  });
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInUser(username, password);
      try {
        localStorage.setItem(LAST_USER, username.trim());
      } catch {}
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    setError(null);
    try {
      await signInAdmin();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Logo />
      <h1 className="mb-1 text-center text-2xl font-bold">Carnets</h1>
      <p className="mb-6 text-center text-muted">Escáner de carnets por contratista</p>

      <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-paper p-1" role="tablist" aria-label="Tipo de acceso">
        {(["user", "admin"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`min-h-11 rounded-lg text-base font-medium transition ${
              mode === m ? "bg-card shadow-sm ring-1 ring-line" : "text-muted"
            }`}
          >
            {m === "user" ? "Usuario" : "Administrador"}
          </button>
        ))}
      </div>

      {mode === "user" ? (
        <form onSubmit={submit} className="space-y-4">
          <Field
            label="Usuario"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />
          <Field
            label="Contraseña del grupo"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {error && <p className="text-sm text-accent">{error}</p>}
          <button type="submit" className={`${btn.dark} w-full`} disabled={busy || !username.trim() || !password}>
            {busy ? <Spinner /> : "Entrar"}
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="text-center text-sm text-muted">Solo para correos autorizados como administrador.</p>
          <button type="button" className={`${btn.secondary} w-full gap-3`} onClick={google} disabled={busy}>
            {busy ? <Spinner /> : <GoogleIcon />}
            Entrar con Google
          </button>
          {error && <p className="text-sm text-accent">{error}</p>}
        </div>
      )}
    </Screen>
  );
}

/** Muestra login, "Sin acceso" o el contenido según el estado de la sesión. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { state, signOut } = useAuth();

  switch (state.status) {
    case "loading":
      return (
        <Screen>
          <Logo />
          <p className="text-center text-muted">Cargando…</p>
        </Screen>
      );

    case "unconfigured":
      return (
        <Screen>
          <Logo />
          <h1 className="mb-2 text-center text-xl font-bold">Falta configurar Firebase</h1>
          <p className="text-center text-muted">
            Crea el archivo <code>.env.local</code> a partir de <code>.env.local.example</code> y reinicia la app.
          </p>
        </Screen>
      );

    case "signedOut":
      return <LoginForm />;

    case "denied":
      return (
        <Screen>
          <Logo />
          <h1 className="mb-2 text-center text-2xl font-bold">Sin acceso</h1>
          <p className="mb-6 text-center text-muted">
            {state.reason === "admin"
              ? `${state.user.email ?? "Este correo"} no está autorizado como administrador.`
              : state.reason === "noGroup"
                ? "Tu usuario no tiene un grupo asignado. Pide a un administrador que te asigne uno."
                : "Este usuario no está autorizado o fue desactivado. Pide acceso a un administrador."}
          </p>
          <button type="button" className={`${btn.secondary} w-full`} onClick={() => signOut()}>
            Volver a la entrada
          </button>
        </Screen>
      );

    case "error":
      return (
        <Screen>
          <Logo />
          <h1 className="mb-2 text-center text-xl font-bold">Algo salió mal</h1>
          <p className="mb-6 text-center text-muted">{state.message}</p>
          <button type="button" className={`${btn.dark} w-full`} onClick={() => window.location.reload()}>
            Reintentar
          </button>
          <button type="button" className={`${btn.secondary} mt-3 w-full`} onClick={() => signOut()}>
            Cerrar sesión
          </button>
        </Screen>
      );

    case "allowed":
      return <GroupProvider>{children}</GroupProvider>;
  }
}

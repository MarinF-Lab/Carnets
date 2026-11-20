"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { MIN_PASSWORD } from "@/lib/users";
import { authErrorMessage, useAuth } from "./AuthProvider";
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

function LoginForm() {
  const { signIn } = useAuth();
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
      await signIn(username, password);
      try {
        localStorage.setItem(LAST_USER, username.trim());
      } catch {}
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Logo />
      <h1 className="mb-1 text-center text-2xl font-bold">Carnets</h1>
      <p className="mb-7 text-center text-muted">Escáner de carnets por contratista</p>
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
          label="Contraseña"
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
    </Screen>
  );
}

function SetupForm() {
  const { setup } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== repeat) return setError("Las contraseñas no coinciden.");
    setBusy(true);
    setError(null);
    try {
      await setup(username, password);
      try {
        localStorage.setItem(LAST_USER, username.trim());
      } catch {}
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Logo />
      <h1 className="mb-1 text-center text-2xl font-bold">Configuración inicial</h1>
      <p className="mb-6 text-center text-muted">
        Crea tu usuario de administrador y la <strong className="text-ink">contraseña común</strong> que usará todo el
        equipo.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Tu usuario (ej.: isaac)" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" required />
        <Field label={`Contraseña común (mínimo ${MIN_PASSWORD} caracteres)`} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        <Field label="Repite la contraseña" type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" required />
        {error && <p className="text-sm text-accent">{error}</p>}
        <button type="submit" className={`${btn.primary} w-full`} disabled={busy || !username.trim() || !password || !repeat}>
          {busy ? <Spinner /> : "Crear y entrar"}
        </button>
      </form>
    </Screen>
  );
}

/** Muestra configuración inicial, login, "Sin acceso" o el contenido según el estado de la sesión. */
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

    case "setup":
      return <SetupForm />;

    case "signedOut":
      return <LoginForm />;

    case "denied":
      return (
        <Screen>
          <Logo />
          <h1 className="mb-2 text-center text-2xl font-bold">Sin acceso</h1>
          <p className="mb-6 text-center text-muted">
            Este usuario no está autorizado o fue desactivado. Pide acceso a un administrador.
          </p>
          <button type="button" className={`${btn.secondary} w-full`} onClick={() => signOut()}>
            Usar otro usuario
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
      return <>{children}</>;
  }
}

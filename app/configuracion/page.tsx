"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { authErrorMessage, useAllowedUser, useAuth } from "@/components/AuthProvider";
import { Sheet } from "@/components/Dialog";
import { btn, ErrorNote, Icon, input, PageHeader, Spinner } from "@/components/ui";
import { updateSettings, useSettings, type Theme } from "@/lib/settings";
import {
  createAppUser,
  listUsers,
  MIN_PASSWORD,
  normalizeUsername,
  setUserActive,
  setUserRole,
  type AppUser,
  type Role,
} from "@/lib/users";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 px-1 text-sm font-semibold tracking-wide text-muted uppercase">{title}</h2>
      <div className="divide-y divide-line overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-line/60">{children}</div>
    </section>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-14 cursor-pointer items-center gap-4 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        {description && <span className="block text-sm text-muted">{description}</span>}
      </span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className="relative h-7 w-12 shrink-0 rounded-full bg-line transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-ink after:absolute after:top-0.5 after:left-0.5 after:h-6 after:w-6 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5"
      />
    </label>
  );
}

const THEMES: { value: Theme; label: string }[] = [
  { value: "system", label: "Sistema" },
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
];

export default function SettingsPage() {
  const { username, isAdmin } = useAllowedUser();
  const { signOut } = useAuth();
  const settings = useSettings();

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16">
      <PageHeader title="Configuración" backHref="/" />

      <Section title="Escaneo">
        <Toggle
          label="Captura automática"
          description="Saca la foto sola cuando el marco se pone verde."
          checked={settings.autoCapture}
          onChange={(v) => updateSettings({ autoCapture: v })}
        />
        <Toggle
          label="Lectura automática"
          description="Rellena el nombre y el RUT desde las fotos."
          checked={settings.autoRead}
          onChange={(v) => updateSettings({ autoRead: v })}
        />
      </Section>

      <Section title="Apariencia">
        <div className="p-3">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-paper p-1" role="radiogroup" aria-label="Tema">
            {THEMES.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={settings.theme === t.value}
                onClick={() => updateSettings({ theme: t.value })}
                className={`min-h-11 rounded-lg text-base font-medium transition ${
                  settings.theme === t.value ? "bg-card shadow-sm ring-1 ring-line" : "text-muted"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Cuenta">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 font-bold text-accent uppercase">
            {username.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{username}</p>
            <p className="text-sm text-muted">{isAdmin ? "Administrador" : "Usuario"}</p>
          </div>
          <button type="button" className={btn.secondary} onClick={() => signOut()}>
            <Icon.logout /> Salir
          </button>
        </div>
      </Section>

      {isAdmin && <UsersSection />}

      <p className="mt-8 text-center text-sm text-muted">Las preferencias se guardan en este dispositivo.</p>
    </div>
  );
}

function UsersSection() {
  const { user } = useAllowedUser();
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const reload = useCallback(() => {
    listUsers()
      .then(setUsers)
      .catch(() => setError("No se pudieron cargar los usuarios."));
  }, []);
  useEffect(reload, [reload]);

  async function change(u: AppUser, patch: { active?: boolean; role?: Role }) {
    setBusyUid(u.uid);
    setError(null);
    try {
      if (patch.active !== undefined) await setUserActive(u.uid, patch.active);
      if (patch.role) await setUserRole(u.uid, patch.role);
      reload();
    } catch {
      setError("No se pudo actualizar el usuario.");
    } finally {
      setBusyUid(null);
    }
  }

  return (
    <>
      <Section title="Usuarios">
        {users === null && !error && (
          <div className="flex justify-center py-6 text-muted">
            <Spinner />
          </div>
        )}
        {users?.map((u) => {
          const self = u.uid === user.uid;
          return (
            <div key={u.uid} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className={`truncate font-medium ${u.active ? "" : "text-muted line-through"}`}>
                  {u.username}
                  {self && <span className="ml-1 text-sm font-normal text-muted">(tú)</span>}
                </p>
                <p className="text-sm text-muted">
                  {u.role === "admin" ? "Administrador" : "Usuario"} · {u.active ? "Activo" : "Desactivado"}
                </p>
              </div>
              {busyUid === u.uid ? (
                <Spinner className="text-muted" />
              ) : (
                !self && (
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      className={`${btn.ghost} text-sm text-muted`}
                      onClick={() => change(u, { role: u.role === "admin" ? "user" : "admin" })}
                      disabled={!u.active}
                    >
                      {u.role === "admin" ? "Quitar admin" : "Hacer admin"}
                    </button>
                    <button
                      type="button"
                      className={`${btn.ghost} text-sm ${u.active ? "text-accent" : "text-ink"}`}
                      onClick={() => change(u, { active: !u.active })}
                    >
                      {u.active ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                )
              )}
            </div>
          );
        })}
        <button type="button" onClick={() => setAdding(true)} className="flex min-h-12 w-full items-center gap-2 px-4 font-medium text-accent">
          <Icon.plus /> Agregar usuario
        </button>
      </Section>
      {error && (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      <p className="mt-2 px-1 text-sm text-muted">
        Todos entran con su usuario y la contraseña común. Desactiva a quien ya no deba entrar.
      </p>
      {adding && (
        <AddUserDialog
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            reload();
          }}
        />
      )}
    </>
  );
}

function AddUserDialog({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = normalizeUsername(username);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createAppUser(username, role, password);
      onAdded();
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={busy ? () => {} : onClose}>
      <form onSubmit={submit} className="space-y-4">
        <h2 className="text-xl font-bold">Agregar usuario</h2>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-muted">Usuario</span>
          <input
            className={input}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ej.: juan.perez"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            required
          />
          {username && preview !== username.trim() && (
            <span className="mt-1 block text-sm text-muted">Se guardará como: {preview || "—"}</span>
          )}
        </label>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-muted">Rol</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["user", "admin"] as Role[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                aria-pressed={role === r}
                className={role === r ? btn.dark : btn.secondary}
              >
                {r === "admin" ? "Administrador" : "Usuario"}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-muted">Contraseña común</span>
          <input
            className={input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            minLength={MIN_PASSWORD}
            required
          />
          <span className="mt-1 block text-sm text-muted">La misma con la que entras tú.</span>
        </label>
        {error && <p className="text-sm text-accent">{error}</p>}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button type="button" className={btn.secondary} onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className={btn.primary} disabled={busy || !preview || !password}>
            {busy ? <Spinner /> : "Agregar"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

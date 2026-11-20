"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { authErrorMessage, useAllowedUser, useAuth } from "@/components/AuthProvider";
import { ConfirmDialog, ProgressDialog, Sheet } from "@/components/Dialog";
import { useGroup } from "@/components/GroupProvider";
import { btn, ErrorNote, Icon, input, PageHeader, Spinner } from "@/components/ui";
import { assignUngroupedTo, listUngroupedContractors } from "@/lib/db";
import { updateSettings, useSettings, type Theme } from "@/lib/settings";
import {
  addAdmin,
  changeGroupPassword,
  createAppUser,
  createGroup,
  getGroupPassword,
  listAdmins,
  listUsers,
  MIN_PASSWORD,
  moveUser,
  normalizeUsername,
  removeAdmin,
  renameGroup,
  setUserActive,
  type Admin,
  type AppUser,
  type Group,
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
  const { group } = useGroup();
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
            <p className="truncate text-sm text-muted">{isAdmin ? "Administrador" : `Grupo ${group?.name ?? ""}`}</p>
          </div>
          <button type="button" className={btn.secondary} onClick={() => signOut()}>
            <Icon.logout /> Salir
          </button>
        </div>
      </Section>

      {isAdmin && <AdminSections />}

      <p className="mt-8 text-center text-sm text-muted">Las preferencias de escaneo y apariencia se guardan en este dispositivo.</p>
    </div>
  );
}

/* ====================== Administración ====================== */

function AdminSections() {
  const { groups, reload: reloadGroups } = useGroup();
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reloadUsers = useCallback(() => {
    listUsers()
      .then(setUsers)
      .catch(() => setError("No se pudieron cargar los usuarios."));
  }, []);
  useEffect(reloadUsers, [reloadUsers]);

  return (
    <>
      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      <GroupsSection groups={groups} users={users} onChanged={reloadGroups} />
      <UngroupedSection groups={groups} />
      <UsersSection groups={groups} users={users} onChanged={reloadUsers} />
      <AdminsSection />
    </>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex min-h-14 items-center gap-3 px-4 py-3">{children}</div>;
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-12 w-full items-center gap-2 px-4 font-medium text-accent">
      <Icon.plus /> {children}
    </button>
  );
}

/* ---------- Grupos ---------- */

function GroupsSection({ groups, users, onChanged }: { groups: Group[] | null; users: AppUser[] | null; onChanged: () => void }) {
  const [dialog, setDialog] = useState<{ type: "new" } | { type: "edit"; group: Group } | null>(null);
  return (
    <>
      <Section title="Grupos">
        {groups === null && (
          <div className="flex justify-center py-6 text-muted">
            <Spinner />
          </div>
        )}
        {groups?.map((g) => {
          const n = users?.filter((u) => u.groupId === g.id).length ?? 0;
          return (
            <button key={g.id} type="button" onClick={() => setDialog({ type: "edit", group: g })} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{g.name}</p>
                <p className="text-sm text-muted">
                  {n} {n === 1 ? "usuario" : "usuarios"}
                </p>
              </div>
              <span className="text-sm text-muted">Ver</span>
            </button>
          );
        })}
        <AddButton onClick={() => setDialog({ type: "new" })}>Nuevo grupo</AddButton>
      </Section>
      <p className="mt-2 px-1 text-sm text-muted">Cada grupo tiene su contraseña. Los usuarios de un grupo comparten sus datos.</p>
      {dialog?.type === "new" && (
        <NewGroupDialog
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            onChanged();
          }}
        />
      )}
      {dialog?.type === "edit" && (
        <EditGroupDialog
          group={dialog.group}
          onClose={() => setDialog(null)}
          onChanged={onChanged}
        />
      )}
    </>
  );
}

function PasswordInput(props: { value: string; onChange: (v: string) => void; label: string; autoFocus?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-muted">{props.label}</span>
      <div className="relative">
        <input
          className={`${input} pr-20`}
          type={show ? "text" : "password"}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          autoComplete="new-password"
          autoFocus={props.autoFocus}
          minLength={MIN_PASSWORD}
          required
        />
        <button type="button" onClick={() => setShow((v) => !v)} className="absolute top-0 right-0 h-11 px-3 text-sm font-medium text-muted">
          {show ? "Ocultar" : "Mostrar"}
        </button>
      </div>
      <span className="mt-1 block text-sm text-muted">Mínimo {MIN_PASSWORD} caracteres.</span>
    </label>
  );
}

function NewGroupDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createGroup(name, password);
      onDone();
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={busy ? () => {} : onClose}>
      <form onSubmit={submit} className="space-y-4">
        <h2 className="text-xl font-bold">Nuevo grupo</h2>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-muted">Nombre</span>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="ej.: Faena Norte" autoFocus required maxLength={60} />
        </label>
        <PasswordInput label="Contraseña del grupo" value={password} onChange={setPassword} />
        {error && <p className="text-sm text-accent">{error}</p>}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button type="button" className={btn.secondary} onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className={btn.primary} disabled={busy || !name.trim() || password.length < MIN_PASSWORD}>
            {busy ? <Spinner /> : "Crear"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function EditGroupDialog({ group, onClose, onChanged }: { group: Group; onClose: () => void; onChanged: () => void }) {
  const [name, setName] = useState(group.name);
  const [current, setCurrent] = useState<string | null>(null);
  const [showCurrent, setShowCurrent] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [changing, setChanging] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getGroupPassword(group.id)
      .then(setCurrent)
      .catch(() => setCurrent(""));
  }, [group.id]);

  async function saveName() {
    if (!name.trim() || name.trim() === group.name) return;
    setBusy(true);
    setError(null);
    try {
      await renameGroup(group.id, name);
      onChanged();
      setMsg("Nombre actualizado.");
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const failed = await changeGroupPassword(group.id, newPassword, (done, total) => setProgress({ done, total }));
      setCurrent(newPassword);
      setNewPassword("");
      setChanging(false);
      setMsg(
        failed.length
          ? `Contraseña cambiada. No se pudo actualizar a: ${failed.join(", ")}.`
          : "Contraseña cambiada para todo el grupo.",
      );
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }

  if (progress) return <ProgressDialog title="Cambiando contraseña" done={progress.done} total={progress.total} />;

  return (
    <Sheet onClose={busy ? () => {} : onClose}>
      <div className="space-y-5">
        <h2 className="text-xl font-bold">Grupo</h2>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-muted">Nombre</span>
          <div className="flex gap-2">
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            <button type="button" className={btn.secondary} onClick={saveName} disabled={busy || !name.trim() || name.trim() === group.name}>
              Guardar
            </button>
          </div>
        </label>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-muted">Contraseña actual</span>
          <div className="flex min-h-11 items-center gap-2 rounded-xl bg-paper px-4">
            <span className="flex-1 font-mono break-all">{current === null ? "…" : showCurrent ? current || "—" : "••••••••"}</span>
            <button type="button" className="text-sm font-medium text-muted" onClick={() => setShowCurrent((v) => !v)}>
              {showCurrent ? "Ocultar" : "Mostrar"}
            </button>
          </div>
        </div>

        {changing ? (
          <form onSubmit={savePassword} className="space-y-3">
            <PasswordInput label="Nueva contraseña" value={newPassword} onChange={setNewPassword} autoFocus />
            <p className="text-sm text-muted">Se cambiará para todos los usuarios del grupo; tendrán que volver a entrar.</p>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" className={btn.secondary} onClick={() => setChanging(false)} disabled={busy}>
                Cancelar
              </button>
              <button type="submit" className={btn.primary} disabled={busy || newPassword.length < MIN_PASSWORD}>
                Cambiar
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className={`${btn.secondary} w-full`} onClick={() => setChanging(true)}>
            Cambiar contraseña
          </button>
        )}

        {msg && <p className="text-sm text-ok">{msg}</p>}
        {error && <p className="text-sm text-accent">{error}</p>}
        <button type="button" className={`${btn.dark} w-full`} onClick={onClose} disabled={busy}>
          Listo
        </button>
      </div>
    </Sheet>
  );
}

/* ---------- Datos sin grupo ---------- */

function UngroupedSection({ groups }: { groups: Group[] | null }) {
  const [count, setCount] = useState(0);
  const [target, setTarget] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    listUngroupedContractors()
      .then((c) => setCount(c.length))
      .catch(() => setCount(0));
  }, [done]);

  if (!count || !groups?.length) return null;
  const targetGroup = groups.find((g) => g.id === (target || groups[0].id))!;

  return (
    <>
      <Section title="Datos sin grupo">
        <div className="space-y-3 p-4">
          <p>
            Hay <strong>{count}</strong> {count === 1 ? "contratista" : "contratistas"} de antes de crear los grupos. Asígnalos a un grupo para que sus
            usuarios los vean.
          </p>
          <select className={input} value={targetGroup.id} onChange={(e) => setTarget(e.target.value)}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <button type="button" className={`${btn.primary} w-full`} onClick={() => setConfirm(true)}>
            Asignar a {targetGroup.name}
          </button>
        </div>
      </Section>
      {confirm && (
        <ConfirmDialog
          title="Asignar datos"
          message={
            <>
              Los {count} contratistas sin grupo y sus carnets pasarán a <strong className="text-ink">{targetGroup.name}</strong>.
            </>
          }
          confirmLabel="Asignar"
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            await assignUngroupedTo(targetGroup.id);
            setDone((v) => !v);
          }}
        />
      )}
    </>
  );
}

/* ---------- Usuarios ---------- */

function UsersSection({ groups, users, onChanged }: { groups: Group[] | null; users: AppUser[] | null; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState<AppUser | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const groupName = (id: string | null) => groups?.find((g) => g.id === id)?.name ?? "Sin grupo";

  async function toggle(u: AppUser) {
    setBusyUid(u.uid);
    setError(null);
    try {
      await setUserActive(u.uid, !u.active);
      onChanged();
    } catch {
      setError("No se pudo actualizar el usuario.");
    } finally {
      setBusyUid(null);
    }
  }

  return (
    <>
      <Section title="Usuarios">
        {users === null && (
          <div className="flex justify-center py-6 text-muted">
            <Spinner />
          </div>
        )}
        {users?.length === 0 && <Row><p className="text-muted">Aún no hay usuarios.</p></Row>}
        {users?.map((u) => (
          <div key={u.uid} className="px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className={`truncate font-medium ${u.active ? "" : "text-muted line-through"}`}>{u.username}</p>
                <p className="truncate text-sm text-muted">
                  {groupName(u.groupId)} · {u.active ? "Activo" : "Desactivado"}
                </p>
              </div>
              {busyUid === u.uid && <Spinner className="text-muted" />}
            </div>
            <div className="-mb-2 -ml-3 flex gap-1">
              <button type="button" className={`${btn.ghost} text-sm text-muted`} onClick={() => setMoving(u)} disabled={!groups?.length || busyUid === u.uid}>
                Cambiar grupo
              </button>
              <button
                type="button"
                className={`${btn.ghost} text-sm ${u.active ? "text-accent" : "text-ink"}`}
                onClick={() => toggle(u)}
                disabled={busyUid === u.uid}
              >
                {u.active ? "Desactivar" : "Activar"}
              </button>
            </div>
          </div>
        ))}
        {groups?.length ? (
          <AddButton onClick={() => setAdding(true)}>Agregar usuario</AddButton>
        ) : (
          <Row><p className="text-sm text-muted">Crea un grupo antes de agregar usuarios.</p></Row>
        )}
      </Section>
      {error && (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      {adding && groups && (
        <AddUserDialog
          groups={groups}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            onChanged();
          }}
        />
      )}
      {moving && groups && (
        <MoveUserDialog
          user={moving}
          groups={groups}
          onClose={() => setMoving(null)}
          onMoved={() => {
            setMoving(null);
            onChanged();
          }}
        />
      )}
    </>
  );
}

function GroupPicker({ groups, value, onChange }: { groups: Group[]; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-muted">Grupo</span>
      <select className={input} value={value} onChange={(e) => onChange(e.target.value)}>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function AddUserDialog({ groups, onClose, onAdded }: { groups: Group[]; onClose: () => void; onAdded: () => void }) {
  const { group } = useGroup();
  const [username, setUsername] = useState("");
  const [groupId, setGroupId] = useState(group?.id ?? groups[0].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = normalizeUsername(username);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createAppUser(username, groupId);
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
          {username && preview !== username.trim() && <span className="mt-1 block text-sm text-muted">Se guardará como: {preview || "—"}</span>}
        </label>
        <GroupPicker groups={groups} value={groupId} onChange={setGroupId} />
        <p className="text-sm text-muted">Entrará con este usuario y la contraseña del grupo.</p>
        {error && <p className="text-sm text-accent">{error}</p>}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button type="button" className={btn.secondary} onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className={btn.primary} disabled={busy || !preview}>
            {busy ? <Spinner /> : "Agregar"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

function MoveUserDialog({ user, groups, onClose, onMoved }: { user: AppUser; groups: Group[]; onClose: () => void; onMoved: () => void }) {
  const options = groups.filter((g) => g.id !== user.groupId);
  const [groupId, setGroupId] = useState(options[0]?.id ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await moveUser(user, groupId, currentPassword || undefined);
      onMoved();
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={busy ? () => {} : onClose}>
      <form onSubmit={submit} className="space-y-4">
        <h2 className="text-xl font-bold">Cambiar de grupo</h2>
        <p className="text-muted">
          <strong className="text-ink">{user.username}</strong> pasará al grupo elegido y entrará con su contraseña.
        </p>
        {options.length === 0 ? (
          <p className="text-muted">No hay otro grupo disponible.</p>
        ) : (
          <GroupPicker groups={options} value={groupId} onChange={setGroupId} />
        )}
        {!user.groupId && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-muted">Contraseña actual del usuario</span>
            <input className={input} type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </label>
        )}
        {error && <p className="text-sm text-accent">{error}</p>}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button type="button" className={btn.secondary} onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className={btn.primary} disabled={busy || !groupId}>
            {busy ? <Spinner /> : "Cambiar"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/* ---------- Administradores ---------- */

function AdminsSection() {
  const { username: myEmail } = useAllowedUser();
  const [admins, setAdmins] = useState<Admin[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    listAdmins()
      .then(setAdmins)
      .catch(() => setError("No se pudieron cargar los administradores."));
  }, []);
  useEffect(reload, [reload]);

  return (
    <>
      <Section title="Administradores">
        {admins === null && !error && (
          <div className="flex justify-center py-6 text-muted">
            <Spinner />
          </div>
        )}
        {admins?.map((a) => (
          <Row key={a.email}>
            <p className="min-w-0 flex-1 truncate">
              {a.email}
              {a.email === myEmail && <span className="ml-1 text-sm text-muted">(tú)</span>}
            </p>
            {a.email !== myEmail && (
              <button type="button" className={`${btn.ghost} text-sm text-accent`} onClick={() => setRemoving(a.email)}>
                Quitar
              </button>
            )}
          </Row>
        ))}
        <AddButton onClick={() => setAdding(true)}>Autorizar correo</AddButton>
      </Section>
      <p className="mt-2 px-1 text-sm text-muted">Los administradores entran con su cuenta de Google y ven todos los grupos.</p>
      {error && (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      {adding && (
        <AddAdminDialog
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            reload();
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          title="Quitar administrador"
          message={
            <>
              <strong className="text-ink">{removing}</strong> ya no podrá entrar como administrador.
            </>
          }
          confirmLabel="Quitar"
          danger
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await removeAdmin(removing);
            reload();
          }}
        />
      )}
    </>
  );
}

function AddAdminDialog({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const { username: myEmail } = useAllowedUser();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await addAdmin(email, myEmail);
      onAdded();
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={busy ? () => {} : onClose}>
      <form onSubmit={submit} className="space-y-4">
        <h2 className="text-xl font-bold">Autorizar administrador</h2>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-muted">Correo de Google</span>
          <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@gmail.com" autoFocus required />
        </label>
        <p className="text-sm text-muted">Podrá crear grupos, usuarios y otros administradores, y ver todos los datos.</p>
        {error && <p className="text-sm text-accent">{error}</p>}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button type="button" className={btn.secondary} onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className={btn.primary} disabled={busy || !email.trim()}>
            {busy ? <Spinner /> : "Autorizar"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

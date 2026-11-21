/**
 * Administración de grupos, usuarios y administradores.
 * - Los usuarios entran con su usuario + la contraseña de su grupo. La primera vez
 *   se registran solos: la contraseña identifica al grupo (groupKeys/{hash}).
 * - Los administradores entran con Google (correos autorizados en admins/{email}).
 */
import { deleteApp, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db, firebaseApp } from "./firebase";

export type Group = { id: string; name: string };
export type AppUser = { uid: string; username: string; groupId: string | null; active: boolean };
export type Admin = { email: string };

/** Dominio interno: Firebase necesita un correo, el usuario solo ve su nombre. */
const DOMAIN = "usuarios.carnets.app";
export const MIN_PASSWORD = 8;

/** Error con mensaje para mostrar al usuario. */
export class UserError extends Error {}

/** "Juan.Pérez " → "juan.perez" (solo letras, números, punto, guion y guion bajo). */
export function normalizeUsername(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "");
}

export function isValidUsername(u: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{1,29}$/.test(u);
}

export function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@${DOMAIN}`;
}

/**
 * Clave del grupo: SHA-256 de la contraseña. Es el ID del documento groupKeys/{clave},
 * que dice a qué grupo pertenece una contraseña sin guardarla en claro.
 */
export async function groupKey(password: string): Promise<string> {
  const data = new TextEncoder().encode(`carnets-v1:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

const keyDoc = (key: string) => doc(db(), "groupKeys", key);

/** ¿A qué grupo corresponde esta contraseña? (null si a ninguno) */
export async function findGroupByPassword(password: string): Promise<{ groupId: string; name: string; key: string } | null> {
  const key = await groupKey(password);
  const s = await getDoc(keyDoc(key));
  if (!s.exists()) return null;
  return { groupId: String(s.data().groupId), name: String(s.data().name ?? ""), key };
}

async function assertPasswordFree(password: string, exceptGroupId?: string) {
  const existing = await findGroupByPassword(password);
  if (existing && existing.groupId !== exceptGroupId) {
    throw new UserError("Otro grupo ya usa esa contraseña. Elige una distinta.");
  }
}

const groupsCol = () => collection(db(), "groups");
const secretDoc = (groupId: string) => doc(db(), "groupSecrets", groupId);
const usersCol = () => collection(db(), "users");
const adminsCol = () => collection(db(), "admins");

/* ---------- Instancia secundaria (para no cerrar la sesión del admin) ---------- */

async function withSecondaryAuth<T>(fn: (auth: ReturnType<typeof getAuth>) => Promise<T>): Promise<T> {
  const app = initializeApp(firebaseApp().options, `aux-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try {
    const auth = getAuth(app);
    if (process.env.NEXT_PUBLIC_USE_EMULATORS === "1") {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    }
    return await fn(auth);
  } finally {
    await deleteApp(app).catch(() => undefined);
  }
}

function checkPassword(pw: string) {
  if (pw.length < MIN_PASSWORD) throw new UserError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
}

/* ---------- Grupos ---------- */

export async function listGroups(): Promise<Group[]> {
  const snap = await getDocs(groupsCol());
  return snap.docs
    .map((d) => ({ id: d.id, name: String(d.data().name ?? "") }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export async function getGroup(id: string): Promise<Group | null> {
  const s = await getDoc(doc(groupsCol(), id));
  return s.exists() ? { id: s.id, name: String(s.data().name ?? "") } : null;
}

export async function createGroup(name: string, password: string): Promise<string> {
  if (!name.trim()) throw new UserError("Escribe un nombre para el grupo.");
  checkPassword(password);
  await assertPasswordFree(password);
  const ref = doc(groupsCol());
  const batch = writeBatch(db());
  batch.set(ref, { name: name.trim(), createdAt: serverTimestamp() });
  batch.set(secretDoc(ref.id), { password });
  batch.set(keyDoc(await groupKey(password)), { groupId: ref.id, name: name.trim() });
  await batch.commit();
  return ref.id;
}

export async function renameGroup(id: string, name: string): Promise<void> {
  const batch = writeBatch(db());
  batch.update(doc(groupsCol(), id), { name: name.trim() });
  const password = await getGroupPassword(id).catch(() => null);
  if (password) batch.set(keyDoc(await groupKey(password)), { groupId: id, name: name.trim() });
  await batch.commit();
}

/**
 * Asegura que cada grupo tenga su clave de acceso (para grupos creados antes
 * del registro automático). Solo admin; es idempotente.
 */
export async function ensureGroupKeys(groups: Group[]): Promise<void> {
  for (const g of groups) {
    const password = await getGroupPassword(g.id).catch(() => null);
    if (!password) continue;
    const key = await groupKey(password);
    const s = await getDoc(keyDoc(key));
    if (!s.exists() || s.data().groupId !== g.id || s.data().name !== g.name) {
      await setDoc(keyDoc(key), { groupId: g.id, name: g.name });
    }
  }
}

export async function getGroupPassword(groupId: string): Promise<string> {
  const s = await getDoc(secretDoc(groupId));
  if (!s.exists()) throw new UserError("Este grupo no tiene contraseña guardada.");
  return String(s.data().password ?? "");
}

/**
 * Cambia la contraseña del grupo y la de todos sus usuarios.
 * Devuelve los usuarios que no se pudieron actualizar.
 */
export async function changeGroupPassword(
  groupId: string,
  newPassword: string,
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  checkPassword(newPassword);
  await assertPasswordFree(newPassword, groupId);
  const oldPassword = await getGroupPassword(groupId);
  const group = await getGroup(groupId);
  const members = (await listUsers()).filter((u) => u.groupId === groupId);
  const failed: string[] = [];
  onProgress?.(0, members.length);
  for (let i = 0; i < members.length; i++) {
    const u = members[i];
    try {
      await setUserPassword(u.username, oldPassword, newPassword);
    } catch {
      failed.push(u.username);
    }
    onProgress?.(i + 1, members.length);
  }
  const batch = writeBatch(db());
  batch.set(secretDoc(groupId), { password: newPassword });
  batch.delete(keyDoc(await groupKey(oldPassword)));
  batch.set(keyDoc(await groupKey(newPassword)), { groupId, name: group?.name ?? "" });
  await batch.commit();
  return failed;
}

async function setUserPassword(username: string, oldPassword: string, newPassword: string) {
  if (oldPassword === newPassword) return;
  await withSecondaryAuth(async (auth) => {
    const cred = await signInWithEmailAndPassword(auth, usernameToEmail(username), oldPassword);
    await updatePassword(cred.user, newPassword);
    await signOut(auth).catch(() => undefined);
  });
}

/* ---------- Usuarios ---------- */

export async function listUsers(): Promise<AppUser[]> {
  const snap = await getDocs(usersCol());
  return snap.docs
    .map((d) => {
      const x = d.data();
      return {
        uid: d.id,
        username: String(x.username ?? ""),
        groupId: x.groupId ? String(x.groupId) : null,
        active: x.active !== false,
      };
    })
    .sort((a, b) => a.username.localeCompare(b.username, "es"));
}

export async function setUserActive(uid: string, active: boolean): Promise<void> {
  await updateDoc(doc(usersCol(), uid), { active });
}

/**
 * Cambia a un usuario de grupo: su contraseña pasa a ser la del grupo nuevo.
 * Si no tenía grupo, hay que indicar su contraseña actual.
 */
export async function moveUser(user: AppUser, newGroupId: string, currentPassword?: string): Promise<void> {
  const oldPassword = user.groupId ? await getGroupPassword(user.groupId) : currentPassword;
  if (!oldPassword) throw new UserError("Indica la contraseña actual del usuario.");
  const newPassword = await getGroupPassword(newGroupId);
  try {
    await setUserPassword(user.username, oldPassword, newPassword);
  } catch (err) {
    if (err instanceof UserError) throw err;
    throw new UserError("No se pudo cambiar la contraseña del usuario. Revisa la contraseña actual.");
  }
  await updateDoc(doc(usersCol(), user.uid), { groupId: newGroupId });
}

/* ---------- Administradores (Google) ---------- */

export async function listAdmins(): Promise<Admin[]> {
  const snap = await getDocs(adminsCol());
  return snap.docs.map((d) => ({ email: d.id })).sort((a, b) => a.email.localeCompare(b.email));
}

export async function addAdmin(rawEmail: string, addedBy: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError("Correo no válido.");
  await setDoc(doc(adminsCol(), email), { addedBy, createdAt: serverTimestamp() });
}

export async function removeAdmin(email: string): Promise<void> {
  await deleteDoc(doc(adminsCol(), email));
}
